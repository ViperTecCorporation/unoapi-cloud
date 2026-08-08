package main

import (
	"bufio"
	"bytes"
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
