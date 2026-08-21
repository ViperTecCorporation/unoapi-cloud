// relay-bridge exposes WhatsApp's relay media DataChannel to the Node worker
// through a small framed stdio protocol. The media stack intentionally follows
// MeowCaller's direct transport design: UDP -> DTLS client -> SCTP client -> a
// pre-negotiated binary DataChannel on stream 0. It does not create ICE or an
// RTCPeerConnection. The byte-level components are covered by vectors; a live
// relay call remains the integration gate for this path.
package main

import (
	"bufio"
	"encoding/binary"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"sync"

	"github.com/pion/datachannel"
	"github.com/pion/dtls/v3"
	"github.com/pion/dtls/v3/pkg/crypto/selfsign"
	"github.com/pion/logging"
	"github.com/pion/sctp"
)

const (
	frameReady  byte = 1
	framePacket byte = 2
	frameError  byte = 3
	frameClose  byte = 4

	dataChannelID    uint16 = 0
	dataChannelLabel        = "pre-negotiated"
	maxFrameSize            = 1 << 20
)

type framedWriter struct {
	mu sync.Mutex
	w  *bufio.Writer
}

func (w *framedWriter) write(kind byte, payload []byte) error {
	if len(payload) > maxFrameSize {
		return fmt.Errorf("frame too large: %d", len(payload))
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	var header [5]byte
	header[0] = kind
	binary.BigEndian.PutUint32(header[1:], uint32(len(payload)))
	if _, err := w.w.Write(header[:]); err != nil {
		return err
	}
	if len(payload) > 0 {
		if _, err := w.w.Write(payload); err != nil {
			return err
		}
	}
	return w.w.Flush()
}

func readFrame(r *bufio.Reader) (byte, []byte, error) {
	var header [5]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return 0, nil, err
	}
	size := binary.BigEndian.Uint32(header[1:])
	if size > maxFrameSize {
		return 0, nil, fmt.Errorf("frame too large: %d", size)
	}
	payload := make([]byte, int(size))
	if _, err := io.ReadFull(r, payload); err != nil {
		return 0, nil, err
	}
	return header[0], payload, nil
}

func resolveUDPNetwork(host string, requested string) (string, net.IP, error) {
	ip := net.ParseIP(host)
	if ip == nil {
		return "", nil, fmt.Errorf("relay host must be a numeric IPv4 or IPv6 address: %q", host)
	}

	inferred := "udp6"
	bindIP := net.IPv6unspecified
	if ip.To4() != nil {
		inferred = "udp4"
		bindIP = net.IPv4zero
	}

	if requested == "" {
		return inferred, bindIP, nil
	}
	if requested != "udp4" && requested != "udp6" {
		return "", nil, fmt.Errorf("unsupported UDP network %q", requested)
	}
	if requested != inferred {
		return "", nil, fmt.Errorf("relay address family %s is incompatible with %s", inferred, requested)
	}
	return requested, bindIP, nil
}

func connect(host string, port int, requestedNetwork string) (net.PacketConn, net.Conn, *sctp.Association, *datachannel.DataChannel, error) {
	network, bindIP, err := resolveUDPNetwork(host, requestedNetwork)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	remote, err := net.ResolveUDPAddr(network, net.JoinHostPort(host, fmt.Sprint(port)))
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("resolve relay: %w", err)
	}
	udp, err := net.ListenUDP(network, &net.UDPAddr{IP: bindIP, Port: 0})
	if err != nil {
		return nil, nil, nil, nil, fmt.Errorf("bind udp: %w", err)
	}
	fail := func(err error) (net.PacketConn, net.Conn, *sctp.Association, *datachannel.DataChannel, error) {
		_ = udp.Close()
		return nil, nil, nil, nil, err
	}
	cert, err := selfsign.GenerateSelfSignedWithDNS("wa-voip")
	if err != nil {
		return fail(fmt.Errorf("self-signed certificate: %w", err))
	}
	dtlsConn, err := dtls.ClientWithOptions(
		udp,
		remote,
		dtls.WithCertificates(cert),
		dtls.WithInsecureSkipVerify(true),
	)
	if err != nil {
		return fail(fmt.Errorf("dtls handshake: %w", err))
	}
	assoc, err := sctp.ClientWithOptions(sctp.WithNetConn(dtlsConn), sctp.WithName("wa-voip"))
	if err != nil {
		_ = dtlsConn.Close()
		return fail(fmt.Errorf("sctp client: %w", err))
	}
	dc, err := datachannel.Dial(assoc, dataChannelID, &datachannel.Config{
		Negotiated:    true,
		Label:         dataChannelLabel,
		LoggerFactory: logging.NewDefaultLoggerFactory(),
	})
	if err != nil {
		_ = assoc.Close()
		_ = dtlsConn.Close()
		return fail(fmt.Errorf("datachannel dial: %w", err))
	}
	return udp, dtlsConn, assoc, dc, nil
}

func run(host string, port int, network string) error {
	udp, dtlsConn, assoc, dc, err := connect(host, port, network)
	if err != nil {
		return err
	}
	defer udp.Close()
	defer dtlsConn.Close()
	defer assoc.Close()
	defer dc.Close()

	out := &framedWriter{w: bufio.NewWriterSize(os.Stdout, 64*1024)}
	if err := out.write(frameReady, nil); err != nil {
		return err
	}

	recvErr := make(chan error, 1)
	go func() {
		buf := make([]byte, 64*1024)
		for {
			n, err := dc.Read(buf)
			if err != nil {
				recvErr <- err
				return
			}
			packet := append([]byte(nil), buf[:n]...)
			if err := out.write(framePacket, packet); err != nil {
				recvErr <- err
				return
			}
		}
	}()

	in := bufio.NewReaderSize(os.Stdin, 64*1024)
	readErr := make(chan error, 1)
	go func() {
		for {
			kind, payload, err := readFrame(in)
			if err != nil {
				readErr <- err
				return
			}
			switch kind {
			case framePacket:
				if _, err := dc.Write(payload); err != nil {
					readErr <- err
					return
				}
			case frameClose:
				readErr <- nil
				return
			default:
				readErr <- fmt.Errorf("unsupported input frame type: %d", kind)
				return
			}
		}
	}()

	select {
	case err := <-recvErr:
		return fmt.Errorf("datachannel receive: %w", err)
	case err := <-readErr:
		if err == nil || errors.Is(err, io.EOF) {
			return nil
		}
		return fmt.Errorf("datachannel send: %w", err)
	}
}

func main() {
	host := flag.String("host", "", "relay IPv4 or IPv6 address")
	port := flag.Int("port", 0, "relay UDP port")
	network := flag.String("network", "", "relay UDP family: udp4 or udp6 (inferred when omitted)")
	flag.Parse()

	if *host == "" || *port < 1 || *port > 65535 {
		fmt.Fprintln(os.Stderr, "relay-bridge: --host and a valid --port are required")
		os.Exit(2)
	}
	if err := run(*host, *port, *network); err != nil {
		writer := &framedWriter{w: bufio.NewWriter(os.Stdout)}
		_ = writer.write(frameError, []byte(err.Error()))
		fmt.Fprintf(os.Stderr, "relay-bridge: %v\n", err)
		os.Exit(1)
	}
}
