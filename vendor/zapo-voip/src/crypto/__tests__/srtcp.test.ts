import assert from 'node:assert/strict'
import { test } from 'node:test'

import { derivePerJidSrtpKey } from '../encryption.js'
import { SrtcpSender } from '../srtcp.js'

test('SRTCP sender uses separate labels and protects the MeowCaller compound report', () => {
    const callKey = new Uint8Array(32)
    for (let i = 0; i < callKey.length; i++) callKey[i] = i
    const keying = derivePerJidSrtpKey(callKey, '111111111111111:0@lid')
    const entropy = new Uint8Array([
        0, 1, 2, 3, 4, 5, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb
    ])
    const sender = new SrtcpSender(keying, 0x12345678, entropy)
    const packet = sender.createSenderReport(
        { packetsSent: 5, octetsSent: 600, rtpTimestamp: 409600 },
        1_700_000_000_000
    )

    assert.equal(packet.length, 74)
    assert.equal(packet[0], 0x80)
    assert.equal(packet[1], 200)
    assert.equal(Buffer.from(packet.subarray(4, 8)).toString('hex'), '12345678')
    assert.equal(Buffer.from(packet.subarray(60, 64)).toString('hex'), '80000001')
    assert.equal(
        Buffer.from(packet).toString('hex'),
        '80c80006123456784b128a820bac2868a3d1d8dbb6b558f99545520af' +
            'd498532f2ec814bc326f3aa030329d97496f814a0f36e7ca29b5174b' +
            '9a6c00780000001737155923cb5df5f1571'
    )
})
