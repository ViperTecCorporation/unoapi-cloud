"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RtpSession = exports.RtpPacket = exports.RtpHeader = void 0;
exports.isOpusDtxPayload = isOpusDtxPayload;
exports.isWhatsappOpusPayloadType = isWhatsappOpusPayloadType;
exports.isOpusPrimingPayload = isOpusPrimingPayload;
const bytes_js_1 = require("../bytes.js");
const types_js_1 = require("../types.js");
const RTP_VERSION = 2;
const MIN_HEADER_SIZE = 12;
function isOpusDtxPayload(payload) {
    if (payload.length === 0)
        return false;
    if (payload.length === 1) {
        return payload[0] === 0x10 || payload[0] === 0x88 || payload[0] === 0x90;
    }
    if (payload.length > 15)
        return false;
    const first = payload[0];
    if ((first & 0xf8) === 0x08 || first === 0x0a)
        return true;
    return (first & 0xf0) === 0x30 && payload.length <= 6;
}
function isWhatsappOpusPayloadType(payloadType) {
    return payloadType === 120 || payloadType === 121;
}
const OPUS_PRIMING_FRAME_1 = new Uint8Array([
    0x12, 0x36, 0x26, 0x2b, 0x4a, 0xc8, 0x2b, 0x09, 0xc9,
    0x1f, 0x34, 0xc2, 0xd6, 0x7a, 0x01, 0x73, 0x1b, 0x2e
]);
const OPUS_PRIMING_FRAME_2 = new Uint8Array([0x90, 0xb8, 0x14, 0x14, 0xc4]);
function isOpusPrimingPayload(payload) {
    const expected = payload.length === OPUS_PRIMING_FRAME_1.length
        ? OPUS_PRIMING_FRAME_1
        : payload.length === OPUS_PRIMING_FRAME_2.length
            ? OPUS_PRIMING_FRAME_2
            : null;
    if (!expected)
        return false;
    return payload.every((byte, index) => byte === expected[index]);
}
class RtpHeader {
    version = RTP_VERSION;
    padding = false;
    extension = false;
    marker = false;
    payloadType;
    sequenceNumber;
    timestamp;
    ssrc;
    csrc = [];
    extensionProfile = 0;
    extensionData = bytes_js_1.EMPTY_BYTES;
    get csrcCount() {
        return this.csrc.length;
    }
    constructor(payloadType, sequenceNumber, timestamp, ssrc) {
        this.payloadType = payloadType;
        this.sequenceNumber = sequenceNumber;
        this.timestamp = timestamp;
        this.ssrc = ssrc;
    }
    size() {
        let s = MIN_HEADER_SIZE + this.csrcCount * 4;
        if (this.extension) {
            s += 4 + this.extensionData.length;
        }
        return s;
    }
    encode(buf) {
        if (buf.length < this.size()) {
            throw new Error('buffer too small for RTP header');
        }
        buf[0] =
            ((this.version & 0x03) << 6) |
                ((this.padding ? 1 : 0) << 5) |
                ((this.extension ? 1 : 0) << 4) |
                (this.csrcCount & 0x0f);
        buf[1] = ((this.marker ? 1 : 0) << 7) | (this.payloadType & 0x7f);
        (0, bytes_js_1.writeUInt16BE)(buf, this.sequenceNumber, 2);
        (0, bytes_js_1.writeUInt32BE)(buf, this.timestamp, 4);
        (0, bytes_js_1.writeUInt32BE)(buf, this.ssrc, 8);
        let offset = 12;
        for (let i = 0; i < this.csrc.length; i++) {
            (0, bytes_js_1.writeUInt32BE)(buf, this.csrc[i], offset);
            offset += 4;
        }
        if (this.extension) {
            if (this.extensionData.length % 4 !== 0) {
                throw new Error('RTP extension data must be 32-bit aligned');
            }
            (0, bytes_js_1.writeUInt16BE)(buf, this.extensionProfile, offset);
            (0, bytes_js_1.writeUInt16BE)(buf, this.extensionData.length / 4, offset + 2);
            buf.set(this.extensionData, offset + 4);
        }
        return this.size();
    }
    static decode(buf) {
        if (buf.length < MIN_HEADER_SIZE) {
            throw new Error('buffer too small for RTP header');
        }
        const version = (buf[0] >> 6) & 0x03;
        if (version !== RTP_VERSION) {
            throw new Error(`invalid RTP version: ${version}`);
        }
        const padding = ((buf[0] >> 5) & 0x01) !== 0;
        const extension = ((buf[0] >> 4) & 0x01) !== 0;
        const csrcCount = buf[0] & 0x0f;
        const marker = ((buf[1] >> 7) & 0x01) !== 0;
        const payloadType = buf[1] & 0x7f;
        const sequenceNumber = (0, bytes_js_1.readUInt16BE)(buf, 2);
        const timestamp = (0, bytes_js_1.readUInt32BE)(buf, 4);
        const ssrc = (0, bytes_js_1.readUInt32BE)(buf, 8);
        const headerSize = MIN_HEADER_SIZE + csrcCount * 4;
        if (buf.length < headerSize) {
            throw new Error('buffer too small for CSRC list');
        }
        const csrc = [];
        let offset = 12;
        for (let i = 0; i < csrcCount; i++) {
            csrc.push((0, bytes_js_1.readUInt32BE)(buf, offset));
            offset += 4;
        }
        const header = new RtpHeader(payloadType, sequenceNumber, timestamp, ssrc);
        header.version = version;
        header.padding = padding;
        header.extension = extension;
        header.marker = marker;
        header.csrc = csrc;
        if (extension) {
            if (buf.length < offset + 4) {
                throw new Error('buffer too small for RTP extension header');
            }
            header.extensionProfile = (0, bytes_js_1.readUInt16BE)(buf, offset);
            const extWords = (0, bytes_js_1.readUInt16BE)(buf, offset + 2);
            const extBytes = extWords * 4;
            offset += 4;
            if (buf.length < offset + extBytes) {
                throw new Error('buffer too small for RTP extension data');
            }
            header.extensionData = buf.slice(offset, offset + extBytes);
        }
        return header;
    }
}
exports.RtpHeader = RtpHeader;
class RtpPacket {
    header;
    payload;
    constructor(header, payload) {
        this.header = header;
        this.payload = payload;
    }
    size() {
        return this.header.size() + this.payload.length;
    }
    encode() {
        const buf = new Uint8Array(this.size());
        const headerSize = this.header.encode(buf);
        buf.set(this.payload, headerSize);
        return buf;
    }
    static decode(buf) {
        const header = RtpHeader.decode(buf);
        let end = buf.length;
        if (header.padding) {
            const padLen = buf[buf.length - 1];
            if (padLen > 0 && header.size() + padLen <= buf.length) {
                end = buf.length - padLen;
            }
        }
        const payload = buf.slice(header.size(), end);
        return new RtpPacket(header, payload);
    }
}
exports.RtpPacket = RtpPacket;
class RtpSession {
    ssrc;
    payloadType;
    sequenceNumber;
    sampleRate;
    timestamp;
    samplesPerPacket;
    speechStarted = false;
    constructor(ssrc, payloadType, sampleRate, samplesPerPacket) {
        this.ssrc = ssrc;
        this.payloadType = payloadType;
        this.sequenceNumber = 1;
        this.sampleRate = sampleRate;
        this.timestamp = 0;
        this.samplesPerPacket = samplesPerPacket;
    }
    static whatsappOpus(ssrc) {
        return new RtpSession(ssrc, types_js_1.PayloadType.WhatsAppOpus, 16000, 960);
    }
    createPacket(payload, marker = false) {
        const header = new RtpHeader(this.payloadType, this.sequenceNumber, this.timestamp, this.ssrc);
        header.marker = marker;
        this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
        this.timestamp = (this.timestamp + this.samplesPerPacket) >>> 0;
        return new RtpPacket(header, payload);
    }
    createPacketWithDuration(payload, durationSamples, marker = false) {
        const header = new RtpHeader(this.payloadType, this.sequenceNumber, this.timestamp, this.ssrc);
        header.marker = marker;
        this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
        this.timestamp = (this.timestamp + durationSamples) >>> 0;
        return new RtpPacket(header, payload);
    }
    createWhatsappOpusPacket(opusPayload, durationSamples, wirePayload = opusPayload) {
        const speech = !isOpusDtxPayload(opusPayload) && !isOpusPrimingPayload(opusPayload);
        const marker = speech && !this.speechStarted;
        if (speech)
            this.speechStarted = true;
        return this.createPacketWithDuration(wirePayload, durationSamples, marker);
    }
}
exports.RtpSession = RtpSession;
