import { hkdf } from 'zapo-js/crypto'

import { readUInt32LE, TEXT_ENCODER, writeUInt32LE } from '../bytes.js'
import { randomBytes } from './primitives.js'

export function formatE2ESrtpParticipantId(jid: string): string {
    const bare = jid.split('/', 1)[0].trim()
    const at = bare.lastIndexOf('@')
    if (at <= 0) return bare

    const user = bare.slice(0, at)
    const domain = bare.slice(at + 1)
    if (domain === 'lid' && !user.includes(':')) {
        return `${user}:0@${domain}`
    }
    return bare
}

export function e2eParticipantIdVariants(jid: string): string[] {
    const variants: string[] = []
    const push = (value: string): void => {
        const normalized = value.trim()
        if (normalized && !variants.includes(normalized)) variants.push(normalized)
    }

    const bare = jid.split('/', 1)[0].trim()
    push(bare)
    push(formatE2ESrtpParticipantId(jid))

    const at = bare.lastIndexOf('@')
    if (at > 0) {
        const user = bare.slice(0, at)
        const domain = bare.slice(at + 1)
        if (domain === 'lid' && user.includes(':')) {
            const base = user.split(':', 1)[0]
            push(`${base}:0@${domain}`)
            push(`${base}@${domain}`)
        }
    }

    return variants
}

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

export function prepareWasmRelayStreamSsrcs(
    streamSsrcs: readonly number[],
    appDataSsrc: number,
    randomSource: (length: number) => Uint8Array = randomBytes
): number[] {
    if (streamSsrcs.length !== 9) throw new Error(`expected 9 relay stream SSRCs`)

    const prepared = [...streamSsrcs]
    const used = new Set(prepared.slice(0, 6).filter((ssrc) => ssrc !== 0))
    if (appDataSsrc !== 0) used.add(appDataSsrc)

    for (let index = 6; index < prepared.length; index++) {
        let selected = 0
        for (let attempt = 0; attempt < 64; attempt++) {
            const bytes = randomSource(4)
            if (bytes.length !== 4) throw new Error('invalid relay SSRC random source')
            const candidate = readUInt32LE(bytes, 0)
            if (candidate !== 0 && !used.has(candidate)) {
                selected = candidate
                break
            }
        }
        if (selected === 0) throw new Error('unable to generate unique auxiliary relay SSRC')
        prepared[index] = selected
        used.add(selected)
    }

    return prepared
}
