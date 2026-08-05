"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVoipSettings = parseVoipSettings;
exports.parseVoipSettingsFromNode = parseVoipSettingsFromNode;
const bytes_js_1 = require("../bytes.js");
const DEFAULT_SETTINGS = {
    codecMode: 'mlow',
    useMlowCodecV1: true,
    frameMs: 0,
    targetBitrate: 0,
    present: false,
    malformed: false
};
function safeMlowFallback(present, malformed) {
    return { ...DEFAULT_SETTINGS, present, malformed };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function parseIntegerString(value) {
    if (value === undefined)
        return 0;
    if (typeof value !== 'string' || !/^[+-]?\d+$/.test(value))
        return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}
function parseVoipSettings(raw) {
    if (raw === null || raw === undefined || raw.length === 0) {
        return safeMlowFallback(false, false);
    }
    const text = typeof raw === 'string' ? raw : bytes_js_1.TEXT_DECODER.decode(raw);
    if (text.trim().length === 0)
        return safeMlowFallback(false, false);
    let document;
    try {
        document = JSON.parse(text);
    }
    catch {
        return safeMlowFallback(true, true);
    }
    if (!isRecord(document))
        return safeMlowFallback(true, true);
    const encode = document.encode;
    const rateControl = document.rc;
    if ((encode !== undefined && !isRecord(encode)) ||
        (rateControl !== undefined && !isRecord(rateControl))) {
        return safeMlowFallback(true, true);
    }
    const useMlowValue = encode?.use_mlow_codec_v1;
    if (useMlowValue !== undefined && typeof useMlowValue !== 'string') {
        return safeMlowFallback(true, true);
    }
    const frameMs = parseIntegerString(encode?.frame_ms);
    const targetBitrate = parseIntegerString(rateControl?.target_bitrate);
    if (frameMs === null || targetBitrate === null) {
        return safeMlowFallback(true, true);
    }
    const useMlowCodecV1 = useMlowValue !== 'false';
    return {
        codecMode: useMlowCodecV1 ? 'mlow' : 'opus',
        useMlowCodecV1,
        frameMs,
        targetBitrate,
        present: true,
        malformed: false
    };
}
function isNodeLike(value) {
    return isRecord(value) && (value.tag === undefined || typeof value.tag === 'string');
}
function findVoipSettingsContent(node) {
    if (node.tag === 'voip_settings') {
        if (typeof node.content === 'string' || node.content instanceof Uint8Array) {
            return node.content;
        }
        return undefined;
    }
    if (!Array.isArray(node.content))
        return undefined;
    for (const child of node.content) {
        if (!isNodeLike(child))
            continue;
        const content = findVoipSettingsContent(child);
        if (content !== undefined)
            return content;
    }
    return undefined;
}
function parseVoipSettingsFromNode(node) {
    return parseVoipSettings(findVoipSettingsContent(node));
}
