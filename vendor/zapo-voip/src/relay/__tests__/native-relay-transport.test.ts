import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'

import { NativeRelayTransport } from '../NativeRelayTransport.js'

class FakeChild extends EventEmitter {
    stdin = new PassThrough()
    stdout = new PassThrough()
    stderr = new PassThrough()
    exitCode: number | null = null
    signalCode: NodeJS.Signals | null = null
    kill = () => true
}

const frame = (kind: number, payload = Buffer.alloc(0)) => {
    const value = Buffer.alloc(5 + payload.length)
    value[0] = kind
    value.writeUInt32BE(payload.length, 1)
    payload.copy(value, 5)
    return value
}

test('native relay transport preserves binary packet boundaries in both directions', () => {
        const child = new FakeChild()
        const written: Buffer[] = []
        child.stdin.on('data', (chunk) => written.push(Buffer.from(chunk)))
        const transport = new NativeRelayTransport({
            host: '157.240.226.133',
            port: 3478,
            binaryPath: '/fake/relay-bridge',
            spawnBridge: (() => child) as never
        })
        const packets: Uint8Array[] = []
        transport.on('message', (packet) => packets.push(packet))

        child.stdout.write(frame(1).subarray(0, 3))
        child.stdout.write(Buffer.concat([frame(1).subarray(3), frame(2, Buffer.from([0x80, 1, 2]))]))

        assert.equal(transport.isOpen, true)
        assert.deepEqual(packets.map((packet) => [...packet]), [[0x80, 1, 2]])
        assert.equal(transport.send(new Uint8Array([0, 4, 5])), true)
        assert.deepEqual(Buffer.concat(written), frame(2, Buffer.from([0, 4, 5])))
        transport.close()
})

test('native relay transport surfaces a framed native error without opening', () => {
        const child = new FakeChild()
        const transport = new NativeRelayTransport({
            host: '57.144.233.57',
            port: 3478,
            binaryPath: '/fake/relay-bridge',
            spawnBridge: (() => child) as never
        })
        const errors: Error[] = []
        transport.on('transport_error', (err) => errors.push(err))

        child.stdout.write(frame(3, Buffer.from('dtls handshake timeout')))

        assert.equal(transport.state, 'failed')
        assert.match(errors[0]?.message ?? '', /dtls handshake timeout/)
})
