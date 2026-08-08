import { TEXT_DECODER } from '../bytes.js'

export type VoipCodecMode = 'mlow' | 'opus'

export interface ParsedVoipSettings {
    readonly codecMode: VoipCodecMode
    readonly useMlowCodecV1: boolean
    readonly frameMs: number
    readonly targetBitrate: number
    readonly present: boolean
    readonly malformed: boolean
}

const DEFAULT_SETTINGS: ParsedVoipSettings = {
    codecMode: 'mlow',
    useMlowCodecV1: true,
    frameMs: 0,
    targetBitrate: 0,
    present: false,
    malformed: false
}

function safeMlowFallback(present: boolean, malformed: boolean): ParsedVoipSettings {
    return { ...DEFAULT_SETTINGS, present, malformed }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseIntegerString(value: unknown): number | null {
    if (value === undefined) return 0
    if (typeof value !== 'string' || !/^[+-]?\d+$/.test(value)) return null

    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseVoipSettings(
    raw: Uint8Array | string | null | undefined
): ParsedVoipSettings {
    if (raw === null || raw === undefined || raw.length === 0) {
        return safeMlowFallback(false, false)
    }

    const text = typeof raw === 'string' ? raw : TEXT_DECODER.decode(raw)
    if (text.trim().length === 0) return safeMlowFallback(false, false)

    let document: unknown
    try {
        document = JSON.parse(text)
    } catch {
        return safeMlowFallback(true, true)
    }

    if (!isRecord(document)) return safeMlowFallback(true, true)

    const encode = document.encode
    const rateControl = document.rc
    if (
        (encode !== undefined && !isRecord(encode)) ||
        (rateControl !== undefined && !isRecord(rateControl))
    ) {
        return safeMlowFallback(true, true)
    }

    const useMlowValue = encode?.use_mlow_codec_v1
    if (useMlowValue !== undefined && typeof useMlowValue !== 'string') {
        return safeMlowFallback(true, true)
    }

    const frameMs = parseIntegerString(encode?.frame_ms)
    const targetBitrate = parseIntegerString(rateControl?.target_bitrate)
    if (frameMs === null || targetBitrate === null) {
        return safeMlowFallback(true, true)
    }

    const useMlowCodecV1 = useMlowValue !== 'false'
    return {
        codecMode: useMlowCodecV1 ? 'mlow' : 'opus',
        useMlowCodecV1,
        frameMs,
        targetBitrate,
        present: true,
        malformed: false
    }
}

interface VoipSettingsNodeLike {
    readonly tag?: string
    readonly content?: unknown
}

function isNodeLike(value: unknown): value is VoipSettingsNodeLike {
    return isRecord(value) && (value.tag === undefined || typeof value.tag === 'string')
}

function findVoipSettingsContent(node: VoipSettingsNodeLike): Uint8Array | string | undefined {
    if (node.tag === 'voip_settings') {
        if (typeof node.content === 'string' || node.content instanceof Uint8Array) {
            return node.content
        }
        return undefined
    }

    if (!Array.isArray(node.content)) return undefined
    for (const child of node.content) {
        if (!isNodeLike(child)) continue
        const content = findVoipSettingsContent(child)
        if (content !== undefined) return content
    }

    return undefined
}

export function parseVoipSettingsFromNode(node: VoipSettingsNodeLike): ParsedVoipSettings {
    return parseVoipSettings(findVoipSettingsContent(node))
}
