"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRelayAddressBytes = parseRelayAddressBytes;
exports.parseIpAddressBytes = parseIpAddressBytes;
const node_net_1 = require("node:net");
function formatIpv6(bytes) {
    const groups = [];
    for (let index = 0; index < 16; index += 2) {
        groups.push(((bytes[index] << 8) | bytes[index + 1]).toString(16));
    }
    return groups.join(':');
}
function parseRelayAddressBytes(content) {
    if (content.length === 6) {
        return {
            ip: `${content[0]}.${content[1]}.${content[2]}.${content[3]}`,
            port: (content[4] << 8) | content[5],
            addressFamily: 4,
            addressBytes: new Uint8Array(content)
        };
    }
    if (content.length === 18) {
        return {
            ip: formatIpv6(content.subarray(0, 16)),
            port: (content[16] << 8) | content[17],
            addressFamily: 6,
            addressBytes: new Uint8Array(content)
        };
    }
    return undefined;
}
function parseIpv4(ip) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isSafeInteger(octet) || octet < 0 || octet > 255)) {
        throw new Error(`invalid IPv4 relay address: ${ip}`);
    }
    return new Uint8Array(octets);
}
function parseIpv6(ip) {
    if (ip.includes('%')) {
        throw new Error(`IPv6 relay address must not contain a zone identifier: ${ip}`);
    }
    let normalized = ip.toLowerCase();
    const ipv4Tail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (ipv4Tail) {
        const ipv4 = parseIpv4(ipv4Tail);
        const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
        const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
        normalized = `${normalized.slice(0, -ipv4Tail.length)}${high}:${low}`;
    }
    const compressedParts = normalized.split('::');
    if (compressedParts.length > 2) {
        throw new Error(`invalid IPv6 relay address: ${ip}`);
    }
    const left = compressedParts[0] ? compressedParts[0].split(':') : [];
    const right = compressedParts.length === 2 && compressedParts[1] ? compressedParts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if ((compressedParts.length === 1 && missing !== 0) || (compressedParts.length === 2 && missing < 1)) {
        throw new Error(`invalid IPv6 relay address: ${ip}`);
    }
    const groups = [...left, ...new Array(missing).fill('0'), ...right];
    if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
        throw new Error(`invalid IPv6 relay address: ${ip}`);
    }
    const bytes = new Uint8Array(16);
    groups.forEach((group, index) => {
        const value = Number.parseInt(group, 16);
        bytes[index * 2] = value >>> 8;
        bytes[index * 2 + 1] = value & 0xff;
    });
    return bytes;
}
function parseIpAddressBytes(ip) {
    const addressFamily = (0, node_net_1.isIP)(ip);
    if (addressFamily === 4) {
        return { addressFamily, bytes: parseIpv4(ip) };
    }
    if (addressFamily === 6) {
        return { addressFamily, bytes: parseIpv6(ip) };
    }
    throw new Error(`invalid numeric relay address: ${ip}`);
}
