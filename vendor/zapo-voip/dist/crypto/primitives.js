"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomBytes = randomBytes;
exports.randomInt = randomInt;
exports.hmacSha1 = hmacSha1;
exports.aesCtr128 = aesCtr128;
const node_crypto_1 = require("node:crypto");
const util_1 = require("zapo-js/util");
function randomBytes(length) {
    return (0, util_1.toBytesView)((0, node_crypto_1.randomBytes)(length));
}
function randomInt(min, max) {
    return (0, node_crypto_1.randomInt)(min, max);
}
function hmacSha1(key, ...parts) {
    const hmac = (0, node_crypto_1.createHmac)('sha1', key);
    for (const part of parts) {
        hmac.update(part);
    }
    return (0, util_1.toBytesView)(hmac.digest());
}
function aesCtr128(key, iv, data) {
    const cipher = (0, node_crypto_1.createCipheriv)('aes-128-ctr', key, iv);
    const output = (0, util_1.toBytesView)(cipher.update(data));
    cipher.final();
    return output;
}
