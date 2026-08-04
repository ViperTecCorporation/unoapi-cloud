import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    WA_RELAY_DATA_CHANNEL_ID,
    WA_RELAY_DATA_CHANNEL_LABEL,
    WaSctpRelay
} from '../WaSctpRelay.js'

test('relay uses the WhatsApp pre-negotiated data channel contract', () => {
    assert.equal(WA_RELAY_DATA_CHANNEL_ID, 0)
    assert.equal(WA_RELAY_DATA_CHANNEL_LABEL, 'pre-negotiated')
})

test('relay keeps every unique peer SSRC for media subscription', () => {
    const relay = new WaSctpRelay()

    relay.setSubscriptionSsrcs([0x11111111, 0x22222222, 0x11111111, 0])

    assert.deepEqual((relay as any).subscriptionSsrcs, [0x11111111, 0x22222222])
    assert.equal((relay as any).subscriptionSsrc, 0x11111111)
})

test('relay keeps participant PIDs parsed from the offer ACK', () => {
    const relay = new WaSctpRelay()

    relay.setParticipantPids(5, 7)

    assert.equal((relay as any).selfPid, 5)
    assert.equal((relay as any).peerPid, 7)
})

test('relay normalizes missing or invalid participant PIDs to zero', () => {
    const relay = new WaSctpRelay()

    relay.setParticipantPids(undefined, Number.NaN)

    assert.equal((relay as any).selfPid, 0)
    assert.equal((relay as any).peerPid, 0)
})

test('relay stores the complete nine-stream WASM allocation plan', () => {
    const relay = new WaSctpRelay()
    const streams = Array.from({ length: 9 }, (_, index) => 0x20000000 + index)

    relay.setStreamSsrcs(streams)

    assert.deepEqual((relay as any).streamSsrcs, streams)
    assert.throws(() => relay.setStreamSsrcs(streams.slice(0, 8)), /expected 9/)
})
