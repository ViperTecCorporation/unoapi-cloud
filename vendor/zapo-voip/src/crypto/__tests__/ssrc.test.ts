import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    generateSecureSsrc,
    generateWasmRelayStreamSsrcs,
    WASM_RELAY_STREAM_SLOT_WORDS
} from '../ssrc.js'

test('generateSecureSsrc is deterministic for fixed inputs', () => {
    const a = generateSecureSsrc('CALLID1234567890', '12345@lid')
    const b = generateSecureSsrc('CALLID1234567890', '12345@lid')
    const c = generateSecureSsrc('CALLID1234567890', '12345@lid', 1)

    assert.equal(a, b)
    assert.notEqual(a, c)
})

test('generateWasmRelayStreamSsrcs follows the nine-slot relay plan', () => {
    const callId = 'CALLID1234567890'
    const participant = '12345:0@lid'
    const streams = generateWasmRelayStreamSsrcs(callId, participant)

    assert.equal(streams.length, 9)
    assert.equal(new Set(streams).size, 9)
    assert.deepEqual(
        streams,
        WASM_RELAY_STREAM_SLOT_WORDS.map((slot) =>
            generateSecureSsrc(callId, participant, slot)
        )
    )
})
