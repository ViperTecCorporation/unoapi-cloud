import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WaSctpRelay } from '../WaSctpRelay.js'

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
