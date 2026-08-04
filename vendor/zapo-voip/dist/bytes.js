"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toBytesView = exports.TEXT_ENCODER = exports.TEXT_DECODER = exports.EMPTY_BYTES = exports.concatBytes = exports.bytesToHex = exports.bytesToBase64 = exports.base64ToBytes = void 0;
exports.readUInt16BE = readUInt16BE;
exports.readUInt32BE = readUInt32BE;
exports.readUInt32LE = readUInt32LE;
exports.readBigUInt64BE = readBigUInt64BE;
exports.writeUInt16BE = writeUInt16BE;
exports.writeUInt32BE = writeUInt32BE;
exports.writeUInt32LE = writeUInt32LE;
exports.writeBigUInt64BE = writeBigUInt64BE;
exports.toArrayBuffer = toArrayBuffer;
const util_1 = require("zapo-js/util");
Object.defineProperty(exports, "base64ToBytes", { enumerable: true, get: function () { return util_1.base64ToBytes; } });
Object.defineProperty(exports, "bytesToBase64", { enumerable: true, get: function () { return util_1.bytesToBase64; } });
Object.defineProperty(exports, "bytesToHex", { enumerable: true, get: function () { return util_1.bytesToHex; } });
Object.defineProperty(exports, "concatBytes", { enumerable: true, get: function () { return util_1.concatBytes; } });
Object.defineProperty(exports, "EMPTY_BYTES", { enumerable: true, get: function () { return util_1.EMPTY_BYTES; } });
Object.defineProperty(exports, "TEXT_DECODER", { enumerable: true, get: function () { return util_1.TEXT_DECODER; } });
Object.defineProperty(exports, "TEXT_ENCODER", { enumerable: true, get: function () { return util_1.TEXT_ENCODER; } });
Object.defineProperty(exports, "toBytesView", { enumerable: true, get: function () { return util_1.toBytesView; } });
function ensureBounds(buf, offset, size) {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > buf.length) {
        throw new RangeError(`byte access out of range: offset ${offset}, size ${size}, length ${buf.length}`);
    }
}
function readUInt16BE(buf, offset) {
    ensureBounds(buf, offset, 2);
    return (buf[offset] << 8) | buf[offset + 1];
}
function readUInt32BE(buf, offset) {
    ensureBounds(buf, offset, 4);
    return (((buf[offset] << 24) |
        (buf[offset + 1] << 16) |
        (buf[offset + 2] << 8) |
        buf[offset + 3]) >>>
        0);
}
function readUInt32LE(buf, offset) {
    ensureBounds(buf, offset, 4);
    return ((buf[offset] |
        (buf[offset + 1] << 8) |
        (buf[offset + 2] << 16) |
        (buf[offset + 3] << 24)) >>>
        0);
}
function readBigUInt64BE(buf, offset) {
    const hi = readUInt32BE(buf, offset);
    const lo = readUInt32BE(buf, offset + 4);
    return (BigInt(hi) << 32n) | BigInt(lo);
}
function writeUInt16BE(buf, value, offset) {
    ensureBounds(buf, offset, 2);
    buf[offset] = (value >> 8) & 0xff;
    buf[offset + 1] = value & 0xff;
}
function writeUInt32BE(buf, value, offset) {
    ensureBounds(buf, offset, 4);
    buf[offset] = (value >> 24) & 0xff;
    buf[offset + 1] = (value >> 16) & 0xff;
    buf[offset + 2] = (value >> 8) & 0xff;
    buf[offset + 3] = value & 0xff;
}
function writeUInt32LE(buf, value, offset) {
    ensureBounds(buf, offset, 4);
    buf[offset] = value & 0xff;
    buf[offset + 1] = (value >> 8) & 0xff;
    buf[offset + 2] = (value >> 16) & 0xff;
    buf[offset + 3] = (value >> 24) & 0xff;
}
function writeBigUInt64BE(buf, value, offset) {
    writeUInt32BE(buf, Number((value >> 32n) & 0xffffffffn), offset);
    writeUInt32BE(buf, Number(value & 0xffffffffn), offset + 4);
}
function toArrayBuffer(bytes) {
    if (bytes.byteOffset === 0 &&
        bytes.byteLength === bytes.buffer.byteLength &&
        bytes.buffer instanceof ArrayBuffer) {
        return bytes.buffer;
    }
    return bytes.slice().buffer;
}
