import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    e2eParticipantIdVariants,
    formatE2ESrtpParticipantId,
    generateSecureSsrc,
    generateWasmRelayStreamSsrcs,
    prepareWasmRelayStreamSsrcs,
    WASM_RELAY_STREAM_SLOT_WORDS
} from '../ssrc.js'

test('E2E participant formatting preserves devices and only adds :0 to bare LIDs', () => {
    assert.equal(formatE2ESrtpParticipantId('12345@lid'), '12345:0@lid')
    assert.equal(formatE2ESrtpParticipantId('12345:28@lid'), '12345:28@lid')
    assert.equal(formatE2ESrtpParticipantId('12345:59@lid/resource'), '12345:59@lid')
    assert.equal(
        formatE2ESrtpParticipantId('5511999999999@s.whatsapp.net'),
        '5511999999999@s.whatsapp.net'
    )
})

test('E2E receive variants cover exact device, device zero and bare LID', () => {
    assert.deepEqual(e2eParticipantIdVariants('12345:28@lid/resource'), [
        '12345:28@lid',
        '12345:0@lid',
        '12345@lid'
    ])
    assert.deepEqual(e2eParticipantIdVariants('12345@lid'), [
        '12345@lid',
        '12345:0@lid'
    ])
})

test('generateSecureSsrc is deterministic for fixed inputs', () => {
    const a = generateSecureSsrc('CALLID1234567890', '12345@lid')
    const b = generateSecureSsrc('CALLID1234567890', '12345@lid')
    const c = generateSecureSsrc('CALLID1234567890', '12345@lid', 1)

    assert.equal(a, b)
    assert.notEqual(a, c)
})

test('prepareWasmRelayStreamSsrcs preserves six derived streams and randomizes auxiliaries', () => {
    const streams = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    let next = 100
    const prepared = prepareWasmRelayStreamSsrcs(streams, 99, () => {
        const bytes = new Uint8Array(4)
        bytes[0] = next++
        return bytes
    })

    assert.deepEqual(prepared.slice(0, 6), streams.slice(0, 6))
    assert.deepEqual(prepared.slice(6), [100, 101, 102])
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

test('generateSecureSsrc matches the MeowCaller slot-zero KAT', () => {
    assert.equal(
        generateSecureSsrc('00112233445566778899AABBCCDDEEFF', '222222222222222:0@lid', 0),
        1805509457
    )
})
