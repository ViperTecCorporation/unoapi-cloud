"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.derivePerJidSrtpKey = derivePerJidSrtpKey;
exports.generateCallKey = generateCallKey;
const crypto_1 = require("zapo-js/crypto");
const bytes_js_1 = require("../bytes.js");
const primitives_js_1 = require("./primitives.js");
function derivePerJidSrtpKey(callKey, deviceJid) {
    const output = (0, crypto_1.hkdf)(callKey, null, bytes_js_1.TEXT_ENCODER.encode(deviceJid), 46);
    return {
        masterKey: output.subarray(0, 16),
        masterSalt: output.subarray(16, 30)
    };
}
function generateCallKey() {
    return (0, primitives_js_1.randomBytes)(32);
}
