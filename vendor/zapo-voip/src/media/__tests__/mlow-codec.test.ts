import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'

test('MLowCodec initializes at 16 kHz with a 960-sample frame size', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.equal(codec.getFrameSize(), 960)
        assert.equal(codec.getSampleRate(), 16_000)
        assert.equal(codec.getFrameDurationMs(), 60)
        assert.equal(codec.getMode(), 'mlow')
        assert.equal(codec.usesSmpl(), true)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec initializes standard Opus with SMPL disabled', async () => {
    const codec = await MLowCodec.create({ mode: 'opus' })
    try {
        assert.equal(codec.getMode(), 'opus')
        assert.equal(codec.usesSmpl(), false)
        assert.equal(codec.getSampleRate(), 16_000)
        assert.equal(codec.getFrameSize(), 960)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec round-trips a standard Opus frame', async () => {
    const codec = await MLowCodec.create({ useSmpl: false })
    try {
        const frame = new Float32Array(960)
        for (let i = 0; i < frame.length; i++) {
            frame[i] = Math.sin((2 * Math.PI * 523.25 * i) / 16_000) * 0.25
        }

        const packet = codec.encode(frame)
        assert.ok(packet.length > 0)

        const decoded = codec.decode(packet)
        const peak = decoded.reduce((current, sample) => Math.max(current, Math.abs(sample)), 0)
        assert.equal(decoded.length, 960)
        assert.ok(peak > 0)
        assert.deepEqual(codec.getStats(), { success: 1, errors: 0, plc: 0 })
    } finally {
        codec.destroy()
    }
})

test('MLowCodec rejects conflicting mode and useSmpl options', async () => {
    await assert.rejects(
        MLowCodec.create({ mode: 'opus', useSmpl: true }),
        /conflicting codec options/
    )
})

test('MLowCodec round-trips a voiced 960-sample frame with useSmpl', async () => {
    const codec = await MLowCodec.create()
    try {
        const frame = new Float32Array(960)
        for (let i = 0; i < frame.length; i++) {
            frame[i] = Math.sin((2 * Math.PI * 440 * i) / 16_000) * 0.25
        }
        const packet = codec.encode(frame)
        assert.ok(packet.length > 0)

        const decoded = codec.decode(packet)
        assert.equal(decoded.length, 960)

        const stats = codec.getStats()
        assert.equal(stats.success, 1)
        assert.equal(stats.errors, 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec PLC returns a full frame on null input', async () => {
    const codec = await MLowCodec.create()
    try {
        const plc = codec.decode(null)
        assert.equal(plc.length, codec.getFrameSize())
        assert.equal(codec.getStats().plc, 1)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec decodes a captured MeowCaller inbound MLow frame', async () => {
    const codec = await MLowCodec.create()
    try {
        const captured = Uint8Array.from(Buffer.from(
            '5033135f52e61c75db208d2afb689d61cf3ce091b4c39358aa20d9ee068f1ab14e7dcb3cab6da0fc916cf036fb98958f771ee98c30def8',
            'hex'
        ))
        const decoded = codec.decode(captured)
        const peak = decoded.reduce((current, sample) => Math.max(current, Math.abs(sample)), 0)

        assert.equal(decoded.length, 960)
        assert.ok(peak > 0)
        assert.deepEqual(codec.getStats(), { success: 1, errors: 0, plc: 0 })
    } finally {
        codec.destroy()
    }
})
