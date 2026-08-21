import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseIpAddressBytes, parseRelayAddressBytes } from '../relay-address.js'

test('relay address parser preserves IPv4 wire format', () => {
    assert.deepEqual(parseRelayAddressBytes(new Uint8Array([57, 144, 137, 57, 0x0d, 0x96])), {
        ip: '57.144.137.57',
        port: 3478,
        addressFamily: 4,
        addressBytes: new Uint8Array([57, 144, 137, 57, 0x0d, 0x96])
    })
})

test('relay address parser accepts the 16-byte IPv6 address plus port', () => {
    const wire = new Uint8Array([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x0d, 0x96])
    assert.deepEqual(parseRelayAddressBytes(wire), {
        ip: '2001:db8:0:0:0:0:0:1',
        port: 3478,
        addressFamily: 6,
        addressBytes: wire
    })
})

test('IP byte parser supports compressed IPv6 and rejects non-numeric relay hosts', () => {
    assert.deepEqual([...parseIpAddressBytes('2001:db8::1').bytes], [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    assert.throws(() => parseIpAddressBytes('relay.example.net'), /invalid numeric relay address/)
})
