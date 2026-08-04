"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSecureSsrc = generateSecureSsrc;
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
