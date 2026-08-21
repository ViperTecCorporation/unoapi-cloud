import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from 'zapo-js/util'

import { TEXT_ENCODER } from '../../bytes.js'
import {
    buildAllocateForRelay,
    buildBindingSuccessForRequest,
    buildBindingRequestWithSubs,
    buildSenderSubscriptions,
    buildSSRCSubscriptionList,
    buildWasmStreamDescriptors,
    buildWhatsAppPing,
    isRtpPacket,
    isStunPacket,
    parseStunResponse
} from '../stun.js'

function stunAttributeTypes(packet: Uint8Array): number[] {
    const types: number[] = []
    for (let offset = 20; offset + 4 <= packet.length; ) {
        const type = (packet[offset] << 8) | packet[offset + 1]
        const length = (packet[offset + 2] << 8) | packet[offset + 3]
        types.push(type)
        offset += 4 + length + ((4 - (length % 4)) % 4)
    }
    return types
}

function stunAttribute(packet: Uint8Array, expectedType: number): Uint8Array | undefined {
    for (let offset = 20; offset + 4 <= packet.length; ) {
        const type = (packet[offset] << 8) | packet[offset + 1]
        const length = (packet[offset + 2] << 8) | packet[offset + 3]
        if (type === expectedType) return packet.subarray(offset + 4, offset + 4 + length)
        offset += 4 + length + ((4 - (length % 4)) % 4)
    }
    return undefined
}

test('buildWhatsAppPing emits a 20-byte STUN-like packet', () => {
    const ping = buildWhatsAppPing()
    assert.equal(ping.length, 20)
    assert.equal(isStunPacket(ping), true)
    const info = parseStunResponse(ping)
    assert.equal(info?.method, 'wa-ping')
})

test('buildSenderSubscriptions encodes protobuf wrapper for SSRC', () => {
    const subs = buildSenderSubscriptions(0x12345678)
    assert.ok(subs.length > 0)
    assert.notEqual(subs[0], 0)
})

test('buildSSRCSubscriptionList carries self and peer SSRCs with their participant ids', () => {
    const subscriptions = buildSSRCSubscriptionList(
        [0x968a8f28],
        [0x0c0092ff],
        1,
        0
    )

    assert.equal(
        bytesToHex(subscriptions),
        '0a0a0801100118a89eaab4090a090800100118ffa58260'
    )
})

test('isRtpPacket and isStunPacket classify first-byte families', () => {
    const stun = buildWhatsAppPing()
    const rtp = new Uint8Array(12)
    rtp[0] = 0x80
    rtp[1] = 120
    const rtcp = new Uint8Array(12)
    rtcp[0] = 0x80
    rtcp[1] = 200

    assert.equal(isStunPacket(stun), true)
    assert.equal(isRtpPacket(stun), false)
    assert.equal(isRtpPacket(rtp), true)
    assert.equal(isRtpPacket(rtcp), false)
    assert.equal(isStunPacket(rtp), false)
})

test('isStunPacket accepts cookieless wa-ping/pong and rejects DTLS', () => {
    const pong = new Uint8Array(20)
    pong[0] = 0x08
    pong[1] = 0x02
    assert.equal(isStunPacket(pong), true)

    const dtls = new Uint8Array(13)
    dtls[0] = 0x16
    dtls[1] = 0xfe
    assert.equal(isStunPacket(dtls), false)
})

test('parseStunResponse reads transaction id as hex', () => {
    const ping = buildWhatsAppPing()
    const info = parseStunResponse(ping)
    assert.ok(info)
    assert.equal(info.transactionId, bytesToHex(ping.subarray(8, 20)))
})

test('buildBindingRequestWithSubs accepts Uint8Array username and key', () => {
    const username = TEXT_ENCODER.encode('remote:local')
    const key = TEXT_ENCODER.encode('ice-password')
    const subs = buildSenderSubscriptions(0xdeadbeef)
    const packet = buildBindingRequestWithSubs(username, key, subs, true, true)
    assert.ok(packet.length >= 20)
    assert.equal(isStunPacket(packet), true)
})

test('buildBindingSuccessForRequest preserves the relay transaction id', () => {
    const request = buildBindingRequestWithSubs(
        TEXT_ENCODER.encode('remote:local'),
        TEXT_ENCODER.encode('ice-password'),
        undefined,
        false,
        false
    )
    const response = buildBindingSuccessForRequest(
        request,
        TEXT_ENCODER.encode('ice-password')
    )

    assert.ok(response)
    assert.equal(bytesToHex(response.subarray(0, 2)), '0101')
    assert.equal(bytesToHex(response.subarray(8, 20)), bytesToHex(request.subarray(8, 20)))
    assert.deepEqual(stunAttributeTypes(response), [0x0008, 0x8028])
})

test('WASM allocate advertises token, nine stream descriptors and relay endpoint', () => {
    const streams = Array.from({ length: 9 }, (_, index) => 0x10000000 + index)
    const descriptors = buildWasmStreamDescriptors(streams)
    const packet = buildAllocateForRelay(
        new Uint8Array([1, 2, 3]),
        descriptors,
        TEXT_ENCODER.encode('relay-key'),
        '1.2.3.4',
        3480
    )

    assert.deepEqual(stunAttributeTypes(packet), [0x4000, 0x4024, 0x0016, 0x0008])
    assert.ok(descriptors.length > 9 * 4)
})

test('WASM allocate encodes IPv6 using WhatsApp little-endian transaction words', () => {
    const transactionId = new Uint8Array(Buffer.from('a0a1a2a3a4a5a6a7a8a9aaab', 'hex'))
    const packet = buildAllocateForRelay(
        new Uint8Array([1, 2, 3]),
        buildWasmStreamDescriptors(Array.from({ length: 9 }, (_, index) => index + 1)),
        TEXT_ENCODER.encode('relay-key'),
        '2001:db8::1',
        3478,
        transactionId
    )

    assert.equal(
        Buffer.from(stunAttribute(packet, 0x0016) ?? []).toString('hex'),
        '00022c840113a9faa3a2a1a0a7a6a5a4abaaa9a9'
    )
})

test('WhatsApp IPv6 XOR dialect reverses each transaction ID uint32 independently', () => {
    const transactionId = new Uint8Array(Buffer.from('5d3393373302694baece8cdb', 'hex'))
    const packet = buildAllocateForRelay(
        new Uint8Array([1, 2, 3]),
        buildWasmStreamDescriptors(Array.from({ length: 9 }, (_, index) => index + 1)),
        TEXT_ENCODER.encode('relay-key'),
        '2001:db8:1234:5678:9abc:def0:1234:5678',
        3478,
        transactionId
    )

    assert.equal(
        Buffer.from(stunAttribute(packet, 0x0016) ?? []).toString('hex'),
        '00022c840113a9fa25a76525d1d5dcc3c9b898d6'
    )
})

test('WASM allocate rejects an incompatible non-numeric relay address', () => {
    assert.throws(
        () =>
            buildAllocateForRelay(
                new Uint8Array([1]),
                buildWasmStreamDescriptors(Array.from({ length: 9 }, (_, index) => index + 1)),
                TEXT_ENCODER.encode('relay-key'),
                'relay.example.net',
                3478
            ),
        /invalid numeric relay address/
    )
})

test('WASM stream descriptors require exactly nine valid SSRCs', () => {
    assert.throws(() => buildWasmStreamDescriptors([1, 2, 3]), /expected 9/)
    assert.throws(
        () => buildWasmStreamDescriptors([1, 2, 3, 4, 5, 6, 7, 8, 0]),
        /invalid WASM relay stream SSRC/
    )
})

test('WASM allocate matches the complete MeowCaller byte KAT', () => {
    const fromHex = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'hex'))
    const descriptors = buildWasmStreamDescriptors([
        1170300490,
        2781599269,
        4281963094,
        2798104311,
        3731645995,
        1364979034,
        2983933125,
        4140589437,
        2522729392
    ])
    const packet = buildAllocateForRelay(
        fromHex('1020304050607080'),
        descriptors,
        fromHex('30313233343536373839616263646566'),
        '157.240.226.133',
        3478,
        fromHex('a0a1a2a3a4a5a6a7a8a9aaab')
    )

    assert.equal(
        Buffer.from(packet).toString('hex'),
        '000300942112a442a0a1a2a3a4a5a6a7a8a9aaab400000081020304050607080402400600a0618cabc85ae040a08100118a5acafae0a0a08100218d6a4e6f90f0a08080118f7dd9eb60a0a0a0801100118abccb1f30d0a0a0801100218dadaef8a050a08080218c5e9ec8e0b0a0a0802100118fdc2b1b60f0a0a0802100218b097f7b2090016000800012c84bce246c700080014816c90841f948115ce794ef87726c00ff74220c7'
    )
})
