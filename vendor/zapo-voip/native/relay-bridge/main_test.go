package main

import (
	"bufio"
	"bytes"
	"net"
	"testing"
)

func TestFrameRoundTripPreservesPacketBoundary(t *testing.T) {
	var raw bytes.Buffer
	w := &framedWriter{w: bufio.NewWriter(&raw)}
	want := []byte{0x80, 0x7f, 0x00, 0xff}
	if err := w.write(framePacket, want); err != nil {
		t.Fatalf("write frame: %v", err)
	}
	kind, got, err := readFrame(bufio.NewReader(&raw))
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}
	if kind != framePacket {
		t.Fatalf("kind = %d, want %d", kind, framePacket)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("payload = %x, want %x", got, want)
	}
}

func TestReadFrameRejectsOversizedPayload(t *testing.T) {
	header := []byte{framePacket, 0x00, 0x10, 0x00, 0x01}
	if _, _, err := readFrame(bufio.NewReader(bytes.NewReader(header))); err == nil {
		t.Fatal("expected oversized frame error")
	}
}

func TestResolveUDPNetworkSelectsExplicitAddressFamily(t *testing.T) {
	tests := []struct {
		name      string
		host      string
		requested string
		wantNet   string
		wantIP    net.IP
	}{
		{name: "ipv4 inferred", host: "57.144.137.57", wantNet: "udp4", wantIP: net.IPv4zero},
		{name: "ipv4 explicit", host: "57.144.137.57", requested: "udp4", wantNet: "udp4", wantIP: net.IPv4zero},
		{name: "ipv6 inferred", host: "2001:db8::1", wantNet: "udp6", wantIP: net.IPv6unspecified},
		{name: "ipv6 explicit", host: "2001:db8::1", requested: "udp6", wantNet: "udp6", wantIP: net.IPv6unspecified},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gotNet, gotIP, err := resolveUDPNetwork(test.host, test.requested)
			if err != nil {
				t.Fatalf("resolve network: %v", err)
			}
			if gotNet != test.wantNet {
				t.Fatalf("network = %q, want %q", gotNet, test.wantNet)
			}
			if !gotIP.Equal(test.wantIP) {
				t.Fatalf("bind IP = %q, want %q", gotIP, test.wantIP)
			}
		})
	}
}

func TestResolveUDPNetworkRejectsIncompatibleOrInvalidAddress(t *testing.T) {
	for _, test := range []struct {
		host      string
		requested string
	}{
		{host: "2001:db8::1", requested: "udp4"},
		{host: "57.144.137.57", requested: "udp6"},
		{host: "relay.example.net", requested: ""},
		{host: "57.144.137.57", requested: "udp"},
	} {
		if _, _, err := resolveUDPNetwork(test.host, test.requested); err == nil {
			t.Fatalf("expected error for host=%q network=%q", test.host, test.requested)
		}
	}
}

func TestBindUDP4AndUDP6OnSeparateSockets(t *testing.T) {
	for _, test := range []struct {
		name    string
		network string
		bindIP  net.IP
	}{
		{name: "udp4", network: "udp4", bindIP: net.IPv4zero},
		{name: "udp6", network: "udp6", bindIP: net.IPv6unspecified},
	} {
		t.Run(test.name, func(t *testing.T) {
			conn, err := net.ListenUDP(test.network, &net.UDPAddr{IP: test.bindIP, Port: 0})
			if err != nil {
				t.Fatalf("bind %s: %v", test.network, err)
			}
			defer conn.Close()

			local, ok := conn.LocalAddr().(*net.UDPAddr)
			if !ok {
				t.Fatalf("local address type = %T", conn.LocalAddr())
			}
			if test.network == "udp4" && local.IP.To4() == nil {
				t.Fatalf("udp4 socket bound to %q", local.IP)
			}
			if test.network == "udp6" && (local.IP.To16() == nil || local.IP.To4() != nil) {
				t.Fatalf("udp6 socket bound to %q", local.IP)
			}
		})
	}
}
