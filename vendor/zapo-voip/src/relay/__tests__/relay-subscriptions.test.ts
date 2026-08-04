import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
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

test('relay keepalive reuses the exact initial WASM allocate packet', () => {
    const relay = new WaSctpRelay()
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x20000000 + index))

    const sent: Uint8Array[] = []
    ;(relay as any).sendToChannel = (_conn: unknown, data: ArrayBuffer) => {
        sent.push(new Uint8Array(data).slice())
        return true
    }

    const relayInfo = {
        ip: '127.0.0.1',
        port: 3478,
        rawToken: new Uint8Array([1, 2, 3, 4]),
        key: 'relay-key'
    }
    const conn = {
        state: 'Open',
        nativeTransport: { isOpen: true },
        cachedAllocate: null
    }

    ;(relay as any).sendStunAllocateOnOpen(conn, relayInfo)
    ;(relay as any).sendStunAllocateOnOpen(conn, relayInfo)

    assert.equal(sent.length, 2)
    assert.deepEqual(sent[1], sent[0])
    assert.deepEqual(sent[0].subarray(8, 20), sent[1].subarray(8, 20))
})

test('non-FNA relay opens through the native DTLS/SCTP transport', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        sent: Uint8Array[] = []
        send(data: Uint8Array) {
            this.sent.push(data.slice())
            return true
        }
        close() {}
        open() {
            this.state = 'open'
            this.isOpen = true
            this.emit('open')
        }
    }

    const native = new FakeNativeTransport()
    const relay = new WaSctpRelay({ nativeTransportFactory: (() => native) as never })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x30000000 + index))

    await relay.configureRelays([
        {
            ip: '57.144.233.57',
            port: 3478,
            token: 'relay-token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 0,
            isFna: false
        }
    ])
    native.open()

    assert.equal(relay.hasConnection(), true)
    assert.equal(native.sent.length >= 2, true)
    assert.equal(native.sent[0][0] & 0xc0, 0)
    relay.cleanup()
})

test('FNA relay also opens through native DTLS/SCTP instead of raw UDP', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        sent: Uint8Array[] = []
        send(data: Uint8Array) {
            this.sent.push(data.slice())
            return true
        }
        close() {}
        open() {
            this.state = 'open'
            this.isOpen = true
            this.emit('open')
        }
    }

    const native = new FakeNativeTransport()
    let factoryCalls = 0
    const relay = new WaSctpRelay({
        nativeTransportFactory: (() => {
            factoryCalls++
            return native
        }) as never
    })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x40000000 + index))

    await relay.configureRelays([
        {
            ip: '157.240.226.133',
            port: 3478,
            token: 'relay-token',
            rawToken: new Uint8Array([4, 5, 6]),
            key: 'relay-key',
            relayId: 1,
            isFna: true
        }
    ])
    native.open()

    assert.equal(factoryCalls, 1)
    assert.equal(relay.hasConnection(), true)
    assert.equal(native.sent.length >= 2, true)
    relay.cleanup()
})
