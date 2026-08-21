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

test('relay logs safe IPv6 allocate wire telemetry without relay credentials', () => {
    const debugEntries: Array<{
        message: string
        context?: Readonly<Record<string, unknown>>
    }> = []
    const logger = {
        level: 'debug',
        trace() {},
        debug(message: string, context?: Readonly<Record<string, unknown>>) {
            debugEntries.push({ message, context })
        },
        info() {},
        warn() {},
        error() {},
        child() {
            return this
        }
    }
    const relay = new WaSctpRelay({ logger: logger as never })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x21000000 + index))

    const sent: Uint8Array[] = []
    ;(relay as any).sendToChannel = (_conn: unknown, data: ArrayBuffer) => {
        sent.push(new Uint8Array(data).slice())
        return true
    }

    const relayInfo = {
        ip: '2001:db8::1',
        port: 3478,
        rawToken: new Uint8Array([1, 2, 3, 4]),
        key: 'relay-key',
        tokenId: '7',
        authTokenId: '8'
    }
    const conn = {
        state: 'Open',
        nativeTransport: { isOpen: true },
        cachedAllocate: null
    }

    ;(relay as any).sendStunAllocateOnOpen(conn, relayInfo)

    const wire = debugEntries.find((entry) => entry.message === 'voip_diag relay_allocate_wire')
    assert.ok(wire?.context)
    assert.equal(wire.context.relayAddressFamily, 6)
    assert.equal(wire.context.endpointAttributeLength, 20)
    assert.equal(wire.context.endpointAddressFamily, 2)
    assert.equal(wire.context.requestTransactionId, Buffer.from(sent[0].subarray(8, 20)).toString('hex'))
    assert.equal(typeof wire.context.endpointAttributeHex, 'string')
    assert.equal('rawToken' in wire.context, false)
    assert.equal('key' in wire.context, false)
})

test('relay logs the first RTP once per connection without relay credentials', () => {
    const debugEntries: Array<{
        message: string
        context?: Readonly<Record<string, unknown>>
    }> = []
    const logger = {
        level: 'debug',
        trace() {},
        debug(message: string, context?: Readonly<Record<string, unknown>>) {
            debugEntries.push({ message, context })
        },
        info() {},
        warn() {},
        error() {},
        child() {
            return this
        }
    }
    const relay = new WaSctpRelay({ logger: logger as never })
    const relayInfo = {
        id: '[2001:db8::1]:3478#8',
        ip: '2001:db8::1',
        port: 3478,
        token: 'secret-token',
        rawToken: new Uint8Array([1, 2, 3]),
        key: 'secret-key',
        relayId: 7,
        name: 'test6c01',
        tokenId: '7',
        authTokenId: '8'
    }
    const conn = {
        state: 'Open',
        nativeTransport: { isOpen: true },
        buffer: [],
        bufferedBytes: 0,
        id: relayInfo.id,
        relayInfo,
        connectionTimeout: null,
        hasReceivedFirstPacket: false,
        hasReceivedFirstRtp: false,
        stableRoutingConnId: 0n,
        cachedAllocate: null,
        stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
    }
    const packet = new Uint8Array(12)
    packet[0] = 0x80
    packet[1] = 120
    packet[2] = 0x12
    packet[3] = 0x34
    packet[8] = 0x11
    packet[9] = 0x22
    packet[10] = 0x33
    packet[11] = 0x44

    ;(relay as any).handleRelayMessage(packet, relayInfo, conn)
    ;(relay as any).handleRelayMessage(packet, relayInfo, conn)

    const entries = debugEntries.filter(
        (entry) => entry.message === 'voip_diag first_relay_rtp_on_connection'
    )
    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0]?.context, {
        connectionId: relayInfo.id,
        relayName: 'test6c01',
        relayId: 7,
        addressFamily: 6,
        tokenId: '7',
        authTokenId: '8',
        sequence: 0x1234,
        ssrc: '0x11223344'
    })
    assert.equal('token' in entries[0]!.context!, false)
    assert.equal('rawToken' in entries[0]!.context!, false)
    assert.equal('key' in entries[0]!.context!, false)
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
    relay.setSubscriptionSsrcs([0x12345678])

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
    assert.deepEqual(
        native.sent.slice(0, 2).map((packet) => (packet[0] << 8) | packet[1]),
        [0x0003, 0x0801]
    )
    relay.cleanup()
})

test('native transport error emits relay_failed and removes the dead connection', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        send() {
            return true
        }
        close() {
            this.state = 'closed'
            this.isOpen = false
        }
        open() {
            this.state = 'open'
            this.isOpen = true
            this.emit('open')
        }
    }

    const native = new FakeNativeTransport()
    const relay = new WaSctpRelay({ nativeTransportFactory: (() => native) as never })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x30500000 + index))
    let failure: any = null
    relay.on('relay_failed', (event) => {
        failure = event
    })

    await relay.configureRelays([
        {
            ip: '57.144.233.57',
            port: 3478,
            token: 'relay-token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 7,
            name: 'bsb1c01'
        }
    ])
    native.open()
    native.emit('transport_error', new Error('test transport failure'))

    assert.equal(relay.hasConnection(), false)
    assert.deepEqual(failure, {
        connectionId: '57.144.233.57:3478',
        relayId: 7,
        relayName: 'bsb1c01',
        ip: '57.144.233.57',
        port: 3478,
        reason: 'native_transport_error'
    })
    relay.cleanup()
})

test('IPv6 allocate mismatch quarantines only the rejected candidate', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        sent: Uint8Array[] = []
        closeCount = 0
        send(data: Uint8Array) {
            this.sent.push(data.slice())
            return true
        }
        close() {
            this.closeCount++
            this.state = 'closed'
            this.isOpen = false
        }
        open() {
            this.state = 'open'
            this.isOpen = true
            this.emit('open')
        }
    }

    const natives = [new FakeNativeTransport(), new FakeNativeTransport()]
    let nextNative = 0
    const relay = new WaSctpRelay({
        nativeTransportFactory: (() => natives[nextNative++]) as never
    })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x30600000 + index))

    const failures: any[] = []
    relay.on('relay_failed', (event) => failures.push(event))

    await relay.configureRelays([
        {
            ip: '57.144.137.57',
            port: 3478,
            token: 'relay-token-v4',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key-v4',
            relayId: 0,
            name: 'bsb1c01',
            authTokenId: '0'
        },
        {
            ip: '2a03:2880:f344:139:face:b00c:0:6749',
            port: 3478,
            token: 'relay-token-v6',
            rawToken: new Uint8Array([4, 5, 6]),
            key: 'relay-key-v6',
            relayId: 0,
            name: 'bsb1c01',
            authTokenId: '0'
        }
    ])
    natives.forEach((native) => native.open())

    const allocateMismatch = new Uint8Array(28)
    allocateMismatch.set([0x01, 0x13, 0x00, 0x08, 0x21, 0x12, 0xa4, 0x42])
    allocateMismatch.set([0x00, 0x09, 0x00, 0x04, 0x00, 0x00, 0x04, 0x34], 20)
    natives[1].emit('message', allocateMismatch)

    assert.equal(relay.hasConnection(), true)
    assert.equal((relay as any).connections.size, 1)
    assert.equal(
        (relay as any).connections.has('57.144.137.57:3478#0'),
        true
    )
    assert.equal(
        (relay as any).keepaliveTimers.has(
            '[2a03:2880:f344:139:face:b00c:0:6749]:3478#0'
        ),
        false
    )
    assert.equal(natives[0].closeCount, 0)
    assert.equal(natives[1].closeCount, 1)
    assert.deepEqual(failures, [
        {
            connectionId: '[2a03:2880:f344:139:face:b00c:0:6749]:3478#0',
            relayId: 0,
            relayName: 'bsb1c01',
            ip: '2a03:2880:f344:139:face:b00c:0:6749',
            port: 3478,
            reason: 'allocate_address_mismatch'
        }
    ])

    natives[0].emit('message', allocateMismatch)
    assert.equal(relay.hasConnection(), true)
    assert.equal((relay as any).connections.size, 1)
    assert.equal(natives[0].closeCount, 0)
    assert.equal(failures.length, 1)
    relay.cleanup()
})

test('relay becomes ready only after the allocate success response', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        send() {
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
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x31000000 + index))

    await relay.configureRelays([
        {
            ip: '57.144.137.57',
            port: 3478,
            token: 'relay-token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 0
        }
    ])
    native.open()

    assert.equal(relay.hasConnection(), true)
    assert.equal(relay.hasReadyConnection(), false)
    const ready = relay.waitForReady(1000)

    const allocateSuccess = new Uint8Array(20)
    allocateSuccess.set([0x01, 0x03, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42])
    native.emit('message', allocateSuccess)

    assert.equal(await ready, true)
    assert.equal(relay.hasReadyConnection(), true)

    relay.cleanup()
    assert.equal(relay.hasReadyConnection(), false)
})

test('relay waits for two allocated candidates before reporting the incoming set ready', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        send() {
            return true
        }
        close() {}
        open() {
            this.state = 'open'
            this.isOpen = true
            this.emit('open')
        }
    }

    const natives = [new FakeNativeTransport(), new FakeNativeTransport()]
    let nextNative = 0
    const relay = new WaSctpRelay({
        nativeTransportFactory: (() => natives[nextNative++]) as never
    })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x32000000 + index))

    await relay.configureRelays([
        {
            ip: '57.144.137.57',
            port: 3478,
            token: 'relay-token-1',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key-1',
            relayId: 0
        },
        {
            ip: '157.240.226.133',
            port: 3478,
            token: 'relay-token-2',
            rawToken: new Uint8Array([4, 5, 6]),
            key: 'relay-key-2',
            relayId: 1
        }
    ])
    natives.forEach((native) => native.open())

    assert.equal(relay.getConfiguredRelayCount(), 2)
    assert.equal(relay.getReadyConnectionCount(), 0)

    let settled = false
    const ready = relay.waitForReadyCount(2, 1000).then((count) => {
        settled = true
        return count
    })
    const allocateSuccess = new Uint8Array(20)
    allocateSuccess.set([0x01, 0x03, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42])

    natives[0].emit('message', allocateSuccess)
    await Promise.resolve()
    assert.equal(relay.getReadyConnectionCount(), 1)
    assert.equal(settled, false)

    natives[1].emit('message', allocateSuccess)
    assert.equal(await ready, 2)
    assert.equal(relay.getReadyConnectionCount(), 2)
    relay.cleanup()
})

test('relay applies provisional election and pins media only after authenticated selection', async () => {
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

    const natives = [new FakeNativeTransport(), new FakeNativeTransport()]
    let nextNative = 0
    const relay = new WaSctpRelay({
        nativeTransportFactory: (() => natives[nextNative++]) as never
    })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x33000000 + index))

    await relay.configureRelays([
        {
            ip: '57.144.137.57',
            port: 3478,
            token: 'relay-token-1',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key-1',
            relayId: 0,
            tokenId: '7'
        },
        {
            ip: '157.240.226.133',
            port: 3478,
            token: 'relay-token-2',
            rawToken: new Uint8Array([4, 5, 6]),
            key: 'relay-key-2',
            relayId: 1,
            tokenId: '9'
        }
    ])
    natives.forEach((native) => native.open())

    const media = new Uint8Array(12)
    media[0] = 0x80
    media[1] = 120

    const beforeSelection = natives.map((native) => native.sent.length)
    relay.broadcast(media.buffer as ArrayBuffer)
    assert.deepEqual(
        natives.map((native, index) => native.sent.length - beforeSelection[index]),
        [0, 0]
    )

    let receivedConnectionId = ''
    let receivedRelayId = -1
    relay.on('relay_receive', (received: { connectionId: string; relayId: number }) => {
        receivedConnectionId = received.connectionId
        receivedRelayId = received.relayId
    })
    natives[1].emit('message', media)
    assert.equal(receivedConnectionId, '157.240.226.133:3478')
    assert.equal(receivedRelayId, 1)

    assert.equal(relay.selectMediaConnection('missing:3478', true), false)
    assert.equal(relay.selectMediaConnectionByRelayId(0), true)
    const beforeElected = natives.map((native) => native.sent.length)
    relay.broadcast(media.buffer as ArrayBuffer)
    assert.deepEqual(
        natives.map((native, index) => native.sent.length - beforeElected[index]),
        [1, 0]
    )

    assert.equal(relay.selectMediaConnection(receivedConnectionId, true), true)
    const beforeConfirmed = natives.map((native) => native.sent.length)
    relay.broadcast(media.buffer as ArrayBuffer)
    assert.deepEqual(
        natives.map((native, index) => native.sent.length - beforeConfirmed[index]),
        [0, 1]
    )
    assert.equal(relay.selectMediaConnection('57.144.137.57:3478', true), false)

    relay.cleanup()
})

test('incoming startup fans media across relays until one path is confirmed', async () => {
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

    const natives = [new FakeNativeTransport(), new FakeNativeTransport()]
    let nextNative = 0
    const relay = new WaSctpRelay({
        nativeTransportFactory: (() => natives[nextNative++]) as never
    })
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x44000000 + index))
    relay.setStartupMediaFanout(true)

    await relay.configureRelays([
        {
            ip: '57.144.233.57',
            port: 3478,
            token: 'relay-token-1',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key-1',
            relayId: 0,
            tokenId: '1'
        },
        {
            ip: '57.145.7.57',
            port: 3478,
            token: 'relay-token-2',
            rawToken: new Uint8Array([4, 5, 6]),
            key: 'relay-key-2',
            relayId: 1,
            tokenId: '0'
        }
    ])
    natives.forEach((native) => native.open())
    assert.equal(relay.selectMediaConnectionByRelayId(0), true)

    const media = new Uint8Array(12)
    media[0] = 0x80
    media[1] = 120

    const beforeFanout = natives.map((native) => native.sent.length)
    relay.broadcast(media.buffer as ArrayBuffer)
    assert.deepEqual(
        natives.map((native, index) => native.sent.length - beforeFanout[index]),
        [1, 1]
    )

    assert.equal(relay.selectMediaConnection('57.145.7.57:3478', true), true)
    const beforeConfirmed = natives.map((native) => native.sent.length)
    relay.broadcast(media.buffer as ArrayBuffer)
    assert.deepEqual(
        natives.map((native, index) => native.sent.length - beforeConfirmed[index]),
        [0, 1]
    )

    relay.cleanup()
})

test('relay follows MeowCaller and never originates STUN binding requests', async () => {
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
    relay.setStreamSsrcs(Array.from({ length: 9 }, (_, index) => 0x50000000 + index))
    relay.setSubscriptionSsrcs([0x11111111, 0x22222222])

    await relay.configureRelays([
        {
            ip: '57.144.233.57',
            port: 3478,
            token: 'relay-token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 0
        }
    ])
    native.open()

    const packetTypes = native.sent.map((packet) => (packet[0] << 8) | packet[1])
    assert.deepEqual(packetTypes.slice(0, 2), [0x0003, 0x0801])
    assert.equal(packetTypes.includes(0x0001), false)
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

test('transport reset preserves media identity and ignores callbacks from the closed candidate', async () => {
    class FakeNativeTransport extends EventEmitter {
        state = 'connecting'
        isOpen = false
        closed = false
        sent: Uint8Array[] = []
        send(data: Uint8Array) {
            this.sent.push(data.slice())
            return true
        }
        close() {
            this.closed = true
            this.state = 'closed'
            this.isOpen = false
        }
        open() {
            this.state = 'open'
            this.isOpen = true
            this.emit('open')
        }
    }

    const natives = [new FakeNativeTransport(), new FakeNativeTransport()]
    let nextNative = 0
    const relay = new WaSctpRelay({
        nativeTransportFactory: (() => natives[nextNative++]) as never
    })
    const streams = Array.from({ length: 9 }, (_, index) => 0x61000000 + index)
    relay.setSsrc(0x60000000)
    relay.setStreamSsrcs(streams)
    relay.setSubscriptionSsrcs([0x62000000])
    relay.setParticipantPids(4, 1)

    await relay.configureRelays([
        {
            ip: '57.144.137.57',
            port: 3499,
            token: 'relay-token-1',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key-1',
            relayId: 0
        }
    ])

    natives[0].open()
    assert.equal(relay.hasConnection(), true)
    assert.equal(natives[0].sent.length >= 2, true)
    const firstCandidateSentBeforeReset = natives[0].sent.length

    relay.resetTransport('test_recovery')
    assert.equal(natives[0].closed, true)
    assert.equal(relay.hasConnection(), false)
    assert.equal(relay.getConfiguredRelayCount(), 0)
    assert.equal((relay as any).audioSsrc, 0x60000000)
    assert.deepEqual((relay as any).streamSsrcs, streams)
    assert.deepEqual((relay as any).subscriptionSsrcs, [0x62000000])
    assert.equal((relay as any).selfPid, 4)
    assert.equal((relay as any).peerPid, 1)

    await relay.configureRelays([
        {
            ip: '157.240.226.133',
            port: 3501,
            token: 'relay-token-2',
            rawToken: new Uint8Array([4, 5, 6]),
            key: 'relay-key-2',
            relayId: 1
        }
    ])

    let received = 0
    relay.on('relay_receive', () => received++)
    natives[0].open()
    natives[0].emit('message', new Uint8Array([0x80, 120, 0, 1]))
    assert.equal(relay.hasConnection(), false)
    assert.equal(received, 0)

    natives[1].open()
    assert.equal(relay.hasConnection(), true)
    assert.equal(relay.getConfiguredRelayCount(), 1)
    assert.equal(natives[0].sent.length, firstCandidateSentBeforeReset)
    assert.equal(natives[1].sent.length >= 2, true)

    relay.cleanup()
})

test('relay recovery stats count remote RTP and RTCP but exclude echoed self media', () => {
    const relay = new WaSctpRelay()
    const selfSsrc = 0x71000000
    const peerSsrc = 0x72000000
    relay.setSsrc(selfSsrc)

    const fakeConnection = {
        id: 'relay:3478',
        stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 },
        hasReceivedFirstPacket: false,
        nativeTransport: { isOpen: true, send: () => true },
        state: 'Open'
    }
    const relayInfo = { ip: '127.0.0.1', port: 3478, key: '' }
    const rtp = (ssrc: number) => {
        const packet = new Uint8Array(12)
        packet[0] = 0x80
        packet[1] = 120
        packet[8] = (ssrc >>> 24) & 0xff
        packet[9] = (ssrc >>> 16) & 0xff
        packet[10] = (ssrc >>> 8) & 0xff
        packet[11] = ssrc & 0xff
        return packet
    }
    const rtcp = (ssrc: number) => {
        const packet = new Uint8Array(8)
        packet[0] = 0x80
        packet[1] = 200
        packet[4] = (ssrc >>> 24) & 0xff
        packet[5] = (ssrc >>> 16) & 0xff
        packet[6] = (ssrc >>> 8) & 0xff
        packet[7] = ssrc & 0xff
        return packet
    }

    ;(relay as any).handleRelayMessage(rtp(selfSsrc), relayInfo, fakeConnection)
    ;(relay as any).handleRelayMessage(rtp(peerSsrc), relayInfo, fakeConnection)
    ;(relay as any).handleRelayMessage(rtcp(selfSsrc), relayInfo, fakeConnection)
    ;(relay as any).handleRelayMessage(rtcp(peerSsrc), relayInfo, fakeConnection)

    assert.deepEqual(relay.getReceiveStats(), {
        rtp: 1,
        rtcp: 1,
        pongs: 0,
        received: 4,
        readyConnections: 0,
        lastControlResponseAt: 0
    })
})
