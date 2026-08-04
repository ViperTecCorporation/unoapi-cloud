"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSenderSubscriptions = buildSenderSubscriptions;
exports.buildSSRCSubscriptionList = buildSSRCSubscriptionList;
exports.buildWasmStreamDescriptors = buildWasmStreamDescriptors;
exports.buildAllocateForRelay = buildAllocateForRelay;
exports.buildBindingRequest = buildBindingRequest;
exports.buildBindingSuccessForRequest = buildBindingSuccessForRequest;
exports.buildBindingRequestWithSubs = buildBindingRequestWithSubs;
exports.buildMinimalBindingWithSubs = buildMinimalBindingWithSubs;
exports.buildMinimalAllocateWithSubs = buildMinimalAllocateWithSubs;
exports.buildAllocateRequest = buildAllocateRequest;
exports.buildWhatsAppPing = buildWhatsAppPing;
exports.isStunPacket = isStunPacket;
exports.isRtpPacket = isRtpPacket;
exports.parseStunResponse = parseStunResponse;
exports.formatStunResponse = formatStunResponse;
exports.classifyPacket = classifyPacket;
const util_1 = require("zapo-js/util");
const bytes_js_1 = require("../bytes.js");
const primitives_js_1 = require("../crypto/primitives.js");
const STUN_MAGIC_COOKIE = 0x2112a442;
const STUN_FINGERPRINT_XOR = 0x5354554e;
const STUN_BINDING_REQUEST = 0x0001;
const STUN_BINDING_SUCCESS = 0x0101;
const STUN_ALLOCATE_REQUEST = 0x0003;
const WHATSAPP_PING = 0x0801;
const WHATSAPP_PONG = 0x0802;
const ATTR_USERNAME = 0x0006;
const ATTR_MESSAGE_INTEGRITY = 0x0008;
const ATTR_LIFETIME = 0x000d;
const ATTR_XOR_RELAYED_ADDRESS = 0x0016;
const ATTR_REQUESTED_TRANSPORT = 0x0019;
const ATTR_PRIORITY = 0x0024;
const ATTR_SENDER_SUBSCRIPTIONS = 0x4000;
const ATTR_SSRC_LIST = 0x4024;
const ATTR_ICE_CONTROLLED = 0x8029;
const ATTR_ICE_CONTROLLING = 0x802a;
const ATTR_FINGERPRINT = 0x8028;
const DEFAULT_ICE_PRIORITY = 16_777_215;
function generateTransactionId() {
    return (0, primitives_js_1.randomBytes)(12);
}
function encodeAttribute(attrType, data) {
    const header = new Uint8Array(4);
    (0, bytes_js_1.writeUInt16BE)(header, attrType, 0);
    (0, bytes_js_1.writeUInt16BE)(header, data.length, 2);
    const padding = (4 - (data.length % 4)) % 4;
    const pad = new Uint8Array(padding);
    return (0, bytes_js_1.concatBytes)([header, data, pad]);
}
function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ 0xedb88320;
            }
            else {
                crc >>>= 1;
            }
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function buildStunMessage(msgType, attrs, transactionId, integrityKey, includeFingerprint = true) {
    let attrsData = attrs;
    if (integrityKey) {
        const msgLenForHmac = attrsData.length + 24;
        const hmacHeader = new Uint8Array(20);
        (0, bytes_js_1.writeUInt16BE)(hmacHeader, msgType, 0);
        (0, bytes_js_1.writeUInt16BE)(hmacHeader, msgLenForHmac, 2);
        (0, bytes_js_1.writeUInt32BE)(hmacHeader, STUN_MAGIC_COOKIE, 4);
        hmacHeader.set(transactionId, 8);
        const hmacInput = (0, bytes_js_1.concatBytes)([hmacHeader, attrsData]);
        const hmac = (0, primitives_js_1.hmacSha1)(integrityKey, hmacInput);
        const miAttr = encodeAttribute(ATTR_MESSAGE_INTEGRITY, hmac);
        attrsData = (0, bytes_js_1.concatBytes)([attrsData, miAttr]);
    }
    if (includeFingerprint) {
        const msgLenForCrc = attrsData.length + 8;
        const crcHeader = new Uint8Array(20);
        (0, bytes_js_1.writeUInt16BE)(crcHeader, msgType, 0);
        (0, bytes_js_1.writeUInt16BE)(crcHeader, msgLenForCrc, 2);
        (0, bytes_js_1.writeUInt32BE)(crcHeader, STUN_MAGIC_COOKIE, 4);
        crcHeader.set(transactionId, 8);
        const crcInput = (0, bytes_js_1.concatBytes)([crcHeader, attrsData]);
        const fingerprint = (crc32(crcInput) ^ STUN_FINGERPRINT_XOR) >>> 0;
        const fpBuf = new Uint8Array(4);
        (0, bytes_js_1.writeUInt32BE)(fpBuf, fingerprint, 0);
        const fpAttr = encodeAttribute(ATTR_FINGERPRINT, fpBuf);
        attrsData = (0, bytes_js_1.concatBytes)([attrsData, fpAttr]);
    }
    const header = new Uint8Array(20);
    (0, bytes_js_1.writeUInt16BE)(header, msgType, 0);
    (0, bytes_js_1.writeUInt16BE)(header, attrsData.length, 2);
    (0, bytes_js_1.writeUInt32BE)(header, STUN_MAGIC_COOKIE, 4);
    header.set(transactionId, 8);
    return (0, bytes_js_1.concatBytes)([header, attrsData]);
}
function encodeVarint(value) {
    const bytes = [];
    let v = value >>> 0;
    while (v > 0x7f) {
        bytes.push((v & 0x7f) | 0x80);
        v >>>= 7;
    }
    bytes.push(v & 0x7f);
    return new Uint8Array(bytes);
}
function encodeProtobufVarintField(fieldNumber, value) {
    const tag = encodeVarint((fieldNumber << 3) | 0);
    const val = encodeVarint(value);
    return (0, bytes_js_1.concatBytes)([tag, val]);
}
function encodeProtobufLengthDelimited(fieldNumber, data) {
    const tag = encodeVarint((fieldNumber << 3) | 2);
    const len = encodeVarint(data.length);
    return (0, bytes_js_1.concatBytes)([tag, len, data]);
}
function buildSenderSubscriptions(ssrc) {
    const inner = (0, bytes_js_1.concatBytes)([
        encodeProtobufVarintField(3, ssrc),
        encodeProtobufVarintField(5, 0),
        encodeProtobufVarintField(6, 0)
    ]);
    return encodeProtobufLengthDelimited(1, inner);
}
function buildSSRCSubscriptionList(selfSsrcs, peerSsrcs, selfPid, peerPid) {
    const entries = [];
    for (const ssrc of selfSsrcs) {
        if (ssrc === 0)
            continue;
        const inner = (0, bytes_js_1.concatBytes)([
            encodeProtobufVarintField(1, selfPid),
            encodeProtobufVarintField(2, 1),
            encodeProtobufVarintField(3, ssrc)
        ]);
        entries.push(encodeProtobufLengthDelimited(1, inner));
    }
    for (const peerSsrc of peerSsrcs) {
        if (peerSsrc === 0)
            continue;
        const inner = (0, bytes_js_1.concatBytes)([
            encodeProtobufVarintField(1, peerPid),
            encodeProtobufVarintField(2, 1),
            encodeProtobufVarintField(3, peerSsrc)
        ]);
        entries.push(encodeProtobufLengthDelimited(1, inner));
    }
    return (0, bytes_js_1.concatBytes)(entries);
}
const WASM_STREAM_DESCRIPTOR_PLAN = [
    { participant: 0, layer: 0 },
    { participant: 0, layer: 1 },
    { participant: 0, layer: 2 },
    { participant: 1, layer: 0 },
    { participant: 1, layer: 1 },
    { participant: 1, layer: 2 },
    { participant: 2, layer: 0 },
    { participant: 2, layer: 1 },
    { participant: 2, layer: 2 }
];
/**
 * Builds the WASM/Web StreamDescriptors protobuf carried in STUN attribute 0x4024.
 * The relay expects all nine deterministic streams, even for an audio-only 1:1 call.
 */
function buildWasmStreamDescriptors(streamSsrcs) {
    if (streamSsrcs.length !== WASM_STREAM_DESCRIPTOR_PLAN.length) {
        throw new Error(`expected 9 WASM relay stream SSRCs, got ${streamSsrcs.length}`);
    }
    const descriptors = streamSsrcs.map((ssrc, index) => {
        if (!Number.isSafeInteger(ssrc) || ssrc <= 0 || ssrc > 0xffffffff) {
            throw new Error(`invalid WASM relay stream SSRC at index ${index}`);
        }
        const plan = WASM_STREAM_DESCRIPTOR_PLAN[index];
        const fields = [];
        if (plan.participant !== 0) {
            fields.push(encodeProtobufVarintField(1, plan.participant));
        }
        if (plan.layer !== 0) {
            fields.push(encodeProtobufVarintField(2, plan.layer));
        }
        fields.push(encodeProtobufVarintField(3, ssrc));
        return encodeProtobufLengthDelimited(1, (0, bytes_js_1.concatBytes)(fields));
    });
    return (0, bytes_js_1.concatBytes)(descriptors);
}
function encodeXorRelayedAddress(ip, port) {
    const data = new Uint8Array(8);
    data[0] = 0x00;
    data[1] = 0x01;
    (0, bytes_js_1.writeUInt16BE)(data, port ^ (STUN_MAGIC_COOKIE >>> 16), 2);
    const parts = ip.split('.').map(Number);
    const ipNum = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    (0, bytes_js_1.writeUInt32BE)(data, (ipNum ^ STUN_MAGIC_COOKIE) >>> 0, 4);
    return data;
}
function buildAllocateForRelay(relayToken, streamDescriptors, hmacKey, relayIp, relayPort, transactionId = generateTransactionId()) {
    const parts = [];
    parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, relayToken));
    parts.push(encodeAttribute(ATTR_SSRC_LIST, streamDescriptors));
    if (relayIp && relayPort) {
        parts.push(encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, encodeXorRelayedAddress(relayIp, relayPort)));
    }
    const attrs = (0, bytes_js_1.concatBytes)(parts);
    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, false);
}
function buildBindingRequest(username, hmacKey, senderSubscriptions, includeIceControllingOrOptions = true) {
    const options = typeof includeIceControllingOrOptions === 'boolean'
        ? { iceRole: includeIceControllingOrOptions ? 'controlling' : 'none' }
        : (includeIceControllingOrOptions ?? {});
    const iceRole = options.iceRole ?? 'controlling';
    const includePriority = options.includePriority ?? true;
    const includeUsername = options.includeUsername ?? true;
    const transactionId = generateTransactionId();
    const usernameAttr = includeUsername ? encodeAttribute(ATTR_USERNAME, username) : undefined;
    const priorityAttr = includePriority
        ? (() => {
            const priorityBuf = new Uint8Array(4);
            (0, bytes_js_1.writeUInt32BE)(priorityBuf, DEFAULT_ICE_PRIORITY, 0);
            return encodeAttribute(ATTR_PRIORITY, priorityBuf);
        })()
        : undefined;
    const parts = [];
    if (usernameAttr)
        parts.push(usernameAttr);
    if (priorityAttr)
        parts.push(priorityAttr);
    if (iceRole === 'controlling' || iceRole === 'controlled') {
        const tieBreaker = (0, primitives_js_1.randomBytes)(8);
        const attrType = iceRole === 'controlled' ? ATTR_ICE_CONTROLLED : ATTR_ICE_CONTROLLING;
        parts.push(encodeAttribute(attrType, tieBreaker));
    }
    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions));
    }
    const attrs = (0, bytes_js_1.concatBytes)(parts);
    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, true);
}
/**
 * Answers a relay-originated consent Binding request with the same transaction
 * id. WhatsApp's relay stops forwarding peer media when this consent exchange
 * is left unanswered.
 */
function buildBindingSuccessForRequest(request, integrityKey) {
    if (request.length < 20 || integrityKey.length === 0)
        return undefined;
    const messageType = ((request[0] & 0x3f) << 8) | request[1];
    if (messageType !== STUN_BINDING_REQUEST)
        return undefined;
    if ((0, bytes_js_1.readUInt32BE)(request, 4) !== STUN_MAGIC_COOKIE)
        return undefined;
    return buildStunMessage(STUN_BINDING_SUCCESS, new Uint8Array(0), request.subarray(8, 20), integrityKey, true);
}
function buildBindingRequestWithSubs(username, hmacKey, senderSubscriptions, includeIceControlling, includeFingerprint) {
    const transactionId = generateTransactionId();
    const parts = [];
    if (username && username.length > 0) {
        parts.push(encodeAttribute(ATTR_USERNAME, username));
    }
    const priorityBuf = new Uint8Array(4);
    (0, bytes_js_1.writeUInt32BE)(priorityBuf, DEFAULT_ICE_PRIORITY, 0);
    parts.push(encodeAttribute(ATTR_PRIORITY, priorityBuf));
    if (includeIceControlling) {
        const tieBreaker = (0, primitives_js_1.randomBytes)(8);
        parts.push(encodeAttribute(ATTR_ICE_CONTROLLING, tieBreaker));
    }
    if (senderSubscriptions && senderSubscriptions.length > 0) {
        parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions));
    }
    const attrs = (0, bytes_js_1.concatBytes)(parts);
    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, includeFingerprint);
}
function buildMinimalBindingWithSubs(senderSubscriptions, includeFingerprint = false) {
    const transactionId = generateTransactionId();
    const attrs = encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions);
    return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, undefined, includeFingerprint);
}
function buildMinimalAllocateWithSubs(senderSubscriptions, includeFingerprint = false) {
    const transactionId = generateTransactionId();
    const attrs = encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions);
    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, undefined, includeFingerprint);
}
function buildAllocateRequest(username, hmacKey, lifetime = 3600) {
    const transactionId = generateTransactionId();
    const parts = [];
    parts.push(encodeAttribute(ATTR_REQUESTED_TRANSPORT, new Uint8Array([17, 0, 0, 0])));
    parts.push(encodeAttribute(ATTR_USERNAME, username));
    const lifetimeBuf = new Uint8Array(4);
    (0, bytes_js_1.writeUInt32BE)(lifetimeBuf, lifetime, 0);
    parts.push(encodeAttribute(ATTR_LIFETIME, lifetimeBuf));
    const attrs = (0, bytes_js_1.concatBytes)(parts);
    return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, true);
}
function buildWhatsAppPing() {
    const transactionId = generateTransactionId();
    const header = new Uint8Array(20);
    (0, bytes_js_1.writeUInt16BE)(header, WHATSAPP_PING, 0);
    (0, bytes_js_1.writeUInt16BE)(header, 0, 2);
    (0, bytes_js_1.writeUInt32BE)(header, STUN_MAGIC_COOKIE, 4);
    header.set(transactionId, 8);
    return header;
}
function isStunPacket(data) {
    if (data.length < 2)
        return false;
    if ((data[0] & 0xc0) !== 0)
        return false;
    const type = (0, bytes_js_1.readUInt16BE)(data, 0);
    if (type === WHATSAPP_PING || type === WHATSAPP_PONG)
        return true;
    return data.length >= 8 && (0, bytes_js_1.readUInt32BE)(data, 4) === STUN_MAGIC_COOKIE;
}
function isRtpPacket(data) {
    if (data.length < 2)
        return false;
    if (data[1] >= 192 && data[1] <= 223)
        return false;
    return (data[0] >> 6) === 2;
}
const STUN_ATTR_NAMES = {
    0x0001: 'MAPPED-ADDRESS',
    0x0006: 'USERNAME',
    0x0008: 'MESSAGE-INTEGRITY',
    0x0009: 'ERROR-CODE',
    0x000a: 'UNKNOWN-ATTRIBUTES',
    0x0014: 'REALM',
    0x0015: 'NONCE',
    0x0019: 'REQUESTED-TRANSPORT',
    0x0020: 'XOR-MAPPED-ADDRESS',
    0x0024: 'PRIORITY',
    0x0025: 'USE-CANDIDATE',
    0x4000: 'SENDER-SUBSCRIPTIONS',
    0x4001: 'RECEIVER-SUBSCRIPTION',
    0x4002: 'SUBSCRIPTION-ACK',
    0x8022: 'SOFTWARE',
    0x8028: 'FINGERPRINT',
    0x8029: 'ICE-CONTROLLED',
    0x802a: 'ICE-CONTROLLING',
    0x4033: 'STABLE-ROUTING-CONN-ID'
};
function parseStunResponse(data) {
    if (data.length < 20)
        return null;
    const cookie = (0, bytes_js_1.readUInt32BE)(data, 4);
    if (cookie !== STUN_MAGIC_COOKIE) {
        const msgType = (0, bytes_js_1.readUInt16BE)(data, 0);
        if (msgType === 0x0801 || msgType === 0x0802) {
            return {
                rawType: msgType,
                method: msgType === 0x0801 ? 'wa-ping' : 'wa-pong',
                stunClass: 'indication',
                isSuccess: false,
                isError: false,
                transactionId: (0, util_1.bytesToHex)(data.subarray(8, 20)),
                length: data.length,
                attributes: []
            };
        }
        return null;
    }
    const rawType = (0, bytes_js_1.readUInt16BE)(data, 0);
    const msgLength = (0, bytes_js_1.readUInt16BE)(data, 2);
    const transactionId = (0, util_1.bytesToHex)(data.subarray(8, 20));
    const c0 = (rawType >> 4) & 0x1;
    const c1 = (rawType >> 8) & 0x1;
    const stunClassNum = (c1 << 1) | c0;
    const stunClass = ['request', 'indication', 'success', 'error'][stunClassNum] || 'unknown';
    const method_bits = ((rawType & 0x3e00) >> 2) | ((rawType & 0x00e0) >> 1) | (rawType & 0x000f);
    let method = 'unknown';
    switch (method_bits) {
        case 0x001:
            method = 'binding';
            break;
        case 0x003:
            method = 'allocate';
            break;
        case 0x004:
            method = 'refresh';
            break;
        case 0x006:
            method = 'send';
            break;
        case 0x007:
            method = 'data';
            break;
        case 0x008:
            method = 'create-permission';
            break;
        case 0x009:
            method = 'channel-bind';
            break;
    }
    if (rawType === 0x0801)
        method = 'wa-ping';
    if (rawType === 0x0802)
        method = 'wa-pong';
    const attributes = [];
    let errorCode;
    let errorReason;
    let stableRoutingConnId;
    let offset = 20;
    while (offset + 4 <= 20 + msgLength && offset + 4 <= data.length) {
        const attrType = (0, bytes_js_1.readUInt16BE)(data, offset);
        const attrLength = (0, bytes_js_1.readUInt16BE)(data, offset + 2);
        const attrEnd = offset + 4 + attrLength;
        if (attrEnd > data.length)
            break;
        const attrData = data.subarray(offset + 4, attrEnd);
        attributes.push({
            type: attrType,
            typeName: STUN_ATTR_NAMES[attrType] || `0x${attrType.toString(16).padStart(4, '0')}`,
            length: attrLength,
            data: attrData
        });
        if (attrType === 0x0009 && attrLength >= 4) {
            const errorClass = attrData[2] & 0x07;
            const errorNumber = attrData[3];
            errorCode = errorClass * 100 + errorNumber;
            if (attrLength > 4) {
                errorReason = bytes_js_1.TEXT_DECODER.decode(attrData.subarray(4));
            }
        }
        if (attrType === 0x4033 && stunClass === 'success' && attrLength === 8) {
            stableRoutingConnId = (0, bytes_js_1.readBigUInt64BE)(attrData, 0);
        }
        offset = attrEnd + ((4 - (attrLength % 4)) % 4);
    }
    return {
        rawType,
        method,
        stunClass,
        isSuccess: stunClass === 'success',
        isError: stunClass === 'error',
        errorCode,
        errorReason,
        stableRoutingConnId,
        transactionId,
        length: data.length,
        attributes
    };
}
function formatStunResponse(info) {
    let result = `STUN ${info.method} ${info.stunClass} (0x${info.rawType.toString(16).padStart(4, '0')}, ${info.length}B)`;
    if (info.isError && info.errorCode) {
        result += ` ERROR ${info.errorCode}`;
        if (info.errorReason)
            result += `: ${info.errorReason}`;
    }
    if (info.attributes.length > 0) {
        const attrNames = info.attributes.map((a) => a.typeName).join(', ');
        result += ` [${attrNames}]`;
    }
    return result;
}
function classifyPacket(data) {
    if (data.length < 2)
        return `tiny(${data.length}B)`;
    const firstByte = data[0];
    const twoBits = (firstByte & 0xc0) >> 6;
    if (twoBits === 0) {
        const info = parseStunResponse(data);
        if (info)
            return formatStunResponse(info);
        const msgType = (data[0] << 8) | data[1];
        return `STUN? 0x${msgType.toString(16)} (${data.length}B)`;
    }
    if (twoBits === 2) {
        const pt = data[1] & 0x7f;
        const marker = (data[1] >> 7) & 1;
        const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0;
        return `RTP/SRTP PT=${pt} M=${marker} seq=${seq} (${data.length}B)`;
    }
    if (twoBits === 1) {
        return `DTLS? 0x${firstByte.toString(16)} (${data.length}B)`;
    }
    return `unknown 0x${firstByte.toString(16)} (${data.length}B)`;
}
