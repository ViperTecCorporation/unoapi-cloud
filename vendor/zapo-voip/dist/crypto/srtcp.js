"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SrtcpSender = void 0;
const bytes_js_1 = require("../bytes.js");
const primitives_js_1 = require("./primitives.js");
const rtcp_js_1 = require("../media/rtcp.js");
const SRTCP_ENCRYPTION_LABEL = 0x03;
const SRTCP_AUTH_LABEL = 0x04;
const SRTCP_SALT_LABEL = 0x05;
const SRTCP_AUTH_TAG_LENGTH = 10;
const SRTCP_CLEAR_HEADER_LENGTH = 8;
const SRTCP_INDEX_ENCRYPTED_FLAG = 0x80000000;
class SrtcpSender {
    ssrc;
    sessionKey;
    sessionSalt;
    authKey;
    cname;
    index = 1;
    constructor(keying, ssrc, entropy = (0, primitives_js_1.randomBytes)(12)) {
        this.ssrc = ssrc >>> 0;
        this.sessionKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_ENCRYPTION_LABEL, 16);
        this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_AUTH_LABEL, 20);
        this.sessionSalt = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_SALT_LABEL, 14);
        this.cname = (0, rtcp_js_1.buildWhatsappRtcpCname)(entropy);
    }
    createSenderReport(stats, nowMs = Date.now()) {
        const plain = (0, rtcp_js_1.buildSenderReportWithSdes)(this.ssrc, stats, nowMs, this.cname);
        const protectedPacket = this.protect(plain, this.index);
        this.index = (this.index + 1) & 0x7fffffff;
        if (this.index === 0)
            this.index = 1;
        return protectedPacket;
    }
    protect(rtcp, index) {
        const clearLength = Math.min(rtcp.length, SRTCP_CLEAR_HEADER_LENGTH);
        const output = new Uint8Array(rtcp.length + 4 + SRTCP_AUTH_TAG_LENGTH);
        output.set(rtcp.subarray(0, clearLength), 0);
        const iv = this.generateIv(index);
        const encryptedBody = (0, primitives_js_1.aesCtr128)(this.sessionKey, iv, rtcp.subarray(clearLength));
        output.set(encryptedBody, clearLength);
        const indexOffset = rtcp.length;
        (0, bytes_js_1.writeUInt32BE)(output, (SRTCP_INDEX_ENCRYPTED_FLAG | index) >>> 0, indexOffset);
        const authenticated = output.subarray(0, indexOffset + 4);
        const tag = (0, primitives_js_1.hmacSha1)(this.authKey, authenticated).subarray(0, SRTCP_AUTH_TAG_LENGTH);
        output.set(tag, indexOffset + 4);
        return output;
    }
    generateIv(index) {
        const iv = new Uint8Array(16);
        iv.set(this.sessionSalt, 0);
        const ssrcBuffer = new Uint8Array(4);
        (0, bytes_js_1.writeUInt32BE)(ssrcBuffer, this.ssrc, 0);
        for (let i = 0; i < 4; i++)
            iv[4 + i] ^= ssrcBuffer[i];
        const indexBuffer = new Uint8Array(8);
        (0, bytes_js_1.writeBigUInt64BE)(indexBuffer, BigInt(index >>> 0), 0);
        for (let i = 0; i < 6; i++)
            iv[8 + i] ^= indexBuffer[2 + i];
        return iv;
    }
}
exports.SrtcpSender = SrtcpSender;
function deriveKey(masterKey, masterSalt, label, length) {
    const iv = new Uint8Array(16);
    iv.set(masterSalt.subarray(0, 14), 0);
    iv[7] ^= label;
    return (0, primitives_js_1.aesCtr128)(masterKey, iv, new Uint8Array(length));
}
