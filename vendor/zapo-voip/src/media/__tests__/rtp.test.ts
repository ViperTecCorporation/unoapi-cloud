import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    isOpusDtxPayload,
    isOpusPrimingPayload,
    isWhatsappOpusPayloadType,
    RtpHeader,
    RtpPacket,
    RtpSession
} from '../rtp.js'

test('RtpPacket round-trips header and payload bytes', () => {
    const header = new RtpHeader(120, 42, 960, 0xabcd1234)
    header.marker = true
    header.extension = true
    header.extensionProfile = 0xdebe
    header.extensionData = new Uint8Array([0, 0, 0, 0])

    const payload = new Uint8Array([0xf8, 0xff, 0xfe, 0x01, 0x02])
    const packet = new RtpPacket(header, payload)
    const encoded = packet.encode()
    const decoded = RtpPacket.decode(encoded)

    assert.equal(decoded.header.payloadType, 120)
    assert.equal(decoded.header.sequenceNumber, 42)
    assert.equal(decoded.header.timestamp, 960)
    assert.equal(decoded.header.ssrc, 0xabcd1234)
    assert.equal(decoded.header.marker, true)
    assert.equal(decoded.header.extension, true)
    assert.equal(decoded.header.extensionProfile, 0xdebe)
    assert.deepEqual(decoded.header.extensionData, header.extensionData)
    assert.deepEqual(decoded.payload, payload)
    assert.deepEqual(encoded, packet.encode())
})

test('isOpusDtxPayload recognizes WhatsApp MLOW comfort-noise frames', () => {
    assert.equal(isOpusDtxPayload(new Uint8Array([0x90])), true)
    assert.equal(isOpusDtxPayload(new Uint8Array([0x30, 0x00])), true)
    assert.equal(isOpusDtxPayload(new Uint8Array(20).fill(0x48)), false)
})

test('WhatsApp Opus accepts the two observed RTP payload types', () => {
    assert.equal(isWhatsappOpusPayloadType(120), true)
    assert.equal(isWhatsappOpusPayloadType(121), true)
    assert.equal(isWhatsappOpusPayloadType(97), false)
})

test('isOpusPrimingPayload recognizes the Android priming ladder only', () => {
    assert.equal(isOpusPrimingPayload(new Uint8Array([
        0x12, 0x36, 0x26, 0x2b, 0x4a, 0xc8, 0x2b, 0x09, 0xc9,
        0x1f, 0x34, 0xc2, 0xd6, 0x7a, 0x01, 0x73, 0x1b, 0x2e
    ])), true)
    assert.equal(isOpusPrimingPayload(new Uint8Array([0x90, 0xb8, 0x14, 0x14, 0xc4])), true)
    assert.equal(isOpusPrimingPayload(new Uint8Array([0x50, 0x01, 0x02])), false)
})

test('WhatsApp RTP marker latches on first speech, not priming or DTX', () => {
    const session = RtpSession.whatsappOpus(0x12345678)
    const priming = session.createWhatsappOpusPacket(
        new Uint8Array([0x90, 0xb8, 0x14, 0x14, 0xc4]),
        320
    )
    const dtx = session.createWhatsappOpusPacket(new Uint8Array([0x90]), 320)
    const speech = session.createWhatsappOpusPacket(new Uint8Array(20).fill(0x50), 960)
    const secondSpeech = session.createWhatsappOpusPacket(new Uint8Array(20).fill(0x50), 960)

    assert.equal(priming.header.marker, false)
    assert.equal(dtx.header.marker, false)
    assert.equal(speech.header.marker, true)
    assert.equal(secondSpeech.header.marker, false)
})

test('WhatsApp RTP stream starts with the MeowCaller sequence and timestamp', () => {
    const session = RtpSession.whatsappOpus(0x12345678)
    const first = session.createPacket(new Uint8Array([0x48]))
    const second = session.createPacket(new Uint8Array([0x48]))

    assert.equal(first.header.sequenceNumber, 1)
    assert.equal(first.header.timestamp, 0)
    assert.equal(second.header.sequenceNumber, 2)
    assert.equal(second.header.timestamp, 960)
})

test('RTP speech and DTX headers match the MeowCaller byte KAT', () => {
    const speech = new RtpHeader(120, 1, 0, 0x12345678)
    speech.marker = true
    speech.extension = true
    speech.extensionProfile = 0xdebe
    assert.equal(Buffer.from(speechBytes(speech)).toString('hex'), '90f800010000000012345678debe0000')

    const dtx = new RtpHeader(120, 2, 320, 0x12345678)
    dtx.extension = true
    dtx.extensionProfile = 0xdebe
    dtx.extensionData = new Uint8Array([0x30, 0x01, 0x00, 0x00])
    assert.equal(
        Buffer.from(speechBytes(dtx)).toString('hex'),
        '907800020000014012345678debe000130010000'
    )
})

function speechBytes(header: RtpHeader): Uint8Array {
    const bytes = new Uint8Array(header.size())
    header.encode(bytes)
    return bytes
}
