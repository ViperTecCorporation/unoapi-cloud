import { hkdf } from 'zapo-js/crypto'

import { readUInt32LE, TEXT_ENCODER, writeUInt32LE } from '../bytes.js'

export function generateSecureSsrc(callId: string, selfJid: string, counter = 0): number {
    const key = TEXT_ENCODER.encode(callId)
    const salt = new Uint8Array(4)
    writeUInt32LE(salt, counter, 0)
    const info = TEXT_ENCODER.encode(selfJid)

    const result = hkdf(key, salt, info, 4)
    return readUInt32LE(result, 0)
}

// WhatsApp Web advertises nine deterministic relay streams in this exact slot order.
// Slot 0 is the participant audio SSRC; the remaining slots reserve the other
// audio/video/data layers expected by the WASM relay allocation contract.
export const WASM_RELAY_STREAM_SLOT_WORDS = [0, 1, 4, 2, 3, 5, 7, 8, 6] as const

export function generateWasmRelayStreamSsrcs(callId: string, participantJid: string): number[] {
    return WASM_RELAY_STREAM_SLOT_WORDS.map((slotWord) =>
        generateSecureSsrc(callId, participantJid, slotWord)
    )
}
