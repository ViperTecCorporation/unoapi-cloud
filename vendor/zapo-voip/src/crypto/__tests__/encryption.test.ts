import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { derivePerJidSrtpKey, generateCallKey } from '../encryption.js'
import { SrtpSession } from '../srtp.js'

const fromHex = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'hex'))

test('generateCallKey returns 32 bytes', () => {
    const key = generateCallKey()
    assert.equal(key.length, 32)
    assert.ok(key instanceof Uint8Array)
})

test('derivePerJidSrtpKey produces expected key material lengths', async () => {
    const callKey = new Uint8Array(32)
    for (let i = 0; i < callKey.length; i++) callKey[i] = i

    const keying = derivePerJidSrtpKey(callKey, '12345:0@lid')
    assert.equal(keying.masterKey.length, 16)
    assert.equal(keying.masterSalt.length, 14)
})

test('derivePerJidSrtpKey matches the MeowCaller E2E-SRTP KAT', () => {
    const callKey = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
    const keying = derivePerJidSrtpKey(callKey, '222222222222222:0@lid')
    const context = (new SrtpSession(keying, keying, 4, 4) as any).sendCtx

    assert.equal(Buffer.from(keying.masterKey).toString('hex'), '3f5423fb6f67e4c588bf5741a3a4e92c')
    assert.equal(Buffer.from(keying.masterSalt).toString('hex'), '749ee99101a47c82bb5dacec40cf')
    assert.equal(Buffer.from(context.sessionKey).toString('hex'), '747055a9d18be0fcdc0e29d871309081')
    assert.equal(Buffer.from(context.sessionSalt).toString('hex'), '10fb8133eff7639cc0d06788f49c')
    assert.equal(Buffer.from(context.authKey).toString('hex'), '8eff4bb04971d92512b034ce0ebc466059bfc6ea')
})

test('SrtpSession protect/unprotect round-trips RTP payload', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x11)

    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)

    const header = new RtpHeader(120, 7, 1920, 0x11223344)
    const payload = new Uint8Array([0xf8, 0xff, 0xfe, 0xab, 0xcd])
    const packet = new RtpPacket(header, payload)

    const protectedPacket = session.protect(packet)
    const unprotected = session.unprotect(protectedPacket)

    assert.equal(unprotected.header.sequenceNumber, 7)
    assert.equal(unprotected.header.ssrc, 0x11223344)
    assert.deepEqual(unprotected.payload, payload)
})

test('SrtpSession unprotect rejects a tampered packet', async () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x22)

    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)

    const header = new RtpHeader(120, 9, 1920, 0x55667788)
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const protectedPacket = session.protect(new RtpPacket(header, payload))

    const tampered = protectedPacket.slice()
    tampered[12] ^= 0x80

    assert.throws(() => session.unprotect(tampered), /auth tag verification failed/)
})

test('SrtpSession can authenticate a peer through an alternate device key', () => {
    const callKey = new Uint8Array(32).fill(0x2a)
    const selfKey = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const wrongPeerKey = derivePerJidSrtpKey(callKey, 'peer:28@lid')
    const actualPeerKey = derivePerJidSrtpKey(callKey, 'peer:0@lid')
    const sender = new SrtpSession(actualPeerKey, selfKey, 10, 10)
    const receiver = new SrtpSession(selfKey, wrongPeerKey, 10, 10)
    receiver.setReceiveKeyings([wrongPeerKey, actualPeerKey])

    const packet = new RtpPacket(
        new RtpHeader(120, 1, 0, 0x11223344),
        new Uint8Array([0x50, 1, 2, 3])
    )
    const decoded = receiver.unprotect(sender.protect(packet))

    assert.deepEqual(decoded.payload, packet.payload)
})

test('SrtpSession round-trips across the sequence-number rollover', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x33)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
    const payload = new Uint8Array([0xaa, 0xbb, 0xcc])

    for (const seq of [65533, 65534, 65535, 0, 1, 2]) {
        const header = new RtpHeader(120, seq, (seq * 960) >>> 0, 0x0a0b0c0d)
        const out = session.unprotect(session.protect(new RtpPacket(header, payload)))
        assert.equal(out.header.sequenceNumber, seq)
        assert.deepEqual(out.payload, payload)
    }
})

test('SrtpSession authenticates a reordered packet delayed across rollover', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x44)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
    const payload = new Uint8Array([0x10, 0x20, 0x30, 0x40])
    const mk = (seq: number): Uint8Array => {
        const header = new RtpHeader(120, seq, (seq * 960) >>> 0, 0x0b0c0d0e)
        return session.protect(new RtpPacket(header, payload))
    }

    const delayed = mk(65532)
    const a = mk(65535)
    const b = mk(0)
    const c = mk(1)

    session.unprotect(a)
    session.unprotect(b)
    session.unprotect(c)
    const out = session.unprotect(delayed)
    assert.equal(out.header.sequenceNumber, 65532)
    assert.deepEqual(out.payload, payload)
})

test('SrtpSession rejects a replayed packet', () => {
    const callKey = new Uint8Array(32)
    callKey.fill(0x55)
    const keying = derivePerJidSrtpKey(callKey, 'self:0@lid')
    const session = new SrtpSession(keying, keying, 4, 4)
    const payload = new Uint8Array([0x09, 0x08, 0x07])
    const header = new RtpHeader(120, 100, 96000, 0x0c0d0e0f)
    const packet = session.protect(new RtpPacket(header, payload))

    session.unprotect(packet)
    assert.throws(() => session.unprotect(packet), /replay/)
})
