import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseVoipSettings, parseVoipSettingsFromNode } from '../voip-settings.js'

test('voip_settings defaults to MLow when absent', () => {
    assert.deepEqual(parseVoipSettings(undefined), {
        codecMode: 'mlow',
        useMlowCodecV1: true,
        frameMs: 0,
        targetBitrate: 0,
        present: false,
        malformed: false
    })
})

test('voip_settings selects Opus only for literal use_mlow_codec_v1=false', () => {
    const raw = new TextEncoder().encode(
        JSON.stringify({
            encode: { use_mlow_codec_v1: 'false', frame_ms: '60' },
            rc: { target_bitrate: '25000' }
        })
    )

    assert.deepEqual(parseVoipSettings(raw), {
        codecMode: 'opus',
        useMlowCodecV1: false,
        frameMs: 60,
        targetBitrate: 25_000,
        present: true,
        malformed: false
    })
})

test('voip_settings keeps MLow for true or missing codec flag', () => {
    assert.equal(
        parseVoipSettings('{"encode":{"use_mlow_codec_v1":"true"}}').codecMode,
        'mlow'
    )
    assert.equal(parseVoipSettings('{}').codecMode, 'mlow')
})

test('voip_settings falls back safely to MLow when malformed', () => {
    const malformedJson = parseVoipSettings('{not-json')
    assert.equal(malformedJson.codecMode, 'mlow')
    assert.equal(malformedJson.malformed, true)

    const invalidFlagType = parseVoipSettings(
        '{"encode":{"use_mlow_codec_v1":false}}'
    )
    assert.equal(invalidFlagType.codecMode, 'mlow')
    assert.equal(invalidFlagType.malformed, true)
})

test('voip_settings is found recursively inside a call ack', () => {
    const parsed = parseVoipSettingsFromNode({
        tag: 'ack',
        content: [
            {
                tag: 'relay',
                content: [
                    {
                        tag: 'voip_settings',
                        content: new TextEncoder().encode(
                            '{"encode":{"use_mlow_codec_v1":"false"}}'
                        )
                    }
                ]
            }
        ]
    })

    assert.equal(parsed.codecMode, 'opus')
    assert.equal(parsed.present, true)
    assert.equal(parsed.malformed, false)
})
