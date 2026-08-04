"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WASM_RELAY_STREAM_SLOT_WORDS = void 0;
exports.generateSecureSsrc = generateSecureSsrc;
exports.generateWasmRelayStreamSsrcs = generateWasmRelayStreamSsrcs;
const crypto_1 = require("zapo-js/crypto");
const bytes_js_1 = require("../bytes.js");
function generateSecureSsrc(callId, selfJid, counter = 0) {
    const key = bytes_js_1.TEXT_ENCODER.encode(callId);
    const salt = new Uint8Array(4);
    (0, bytes_js_1.writeUInt32LE)(salt, counter, 0);
    const info = bytes_js_1.TEXT_ENCODER.encode(selfJid);
    const result = (0, crypto_1.hkdf)(key, salt, info, 4);
    return (0, bytes_js_1.readUInt32LE)(result, 0);
}
// WhatsApp Web advertises nine deterministic relay streams in this exact slot order.
// Slot 0 is the participant audio SSRC; the remaining slots reserve the other
// audio/video/data layers expected by the WASM relay allocation contract.
exports.WASM_RELAY_STREAM_SLOT_WORDS = [0, 1, 4, 2, 3, 5, 7, 8, 6];
function generateWasmRelayStreamSsrcs(callId, participantJid) {
    return exports.WASM_RELAY_STREAM_SLOT_WORDS.map((slotWord) => generateSecureSsrc(callId, participantJid, slotWord));
}
