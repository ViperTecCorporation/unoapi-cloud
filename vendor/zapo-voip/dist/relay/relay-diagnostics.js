"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeRelaySignaling = summarizeRelaySignaling;
const transport_1 = require("zapo-js/transport");
const relay_address_js_1 = require("./relay-address.js");
function getDescendantNodes(root) {
    const nodes = [];
    const pending = [root];
    while (pending.length > 0) {
        const current = pending.shift();
        if (!current)
            continue;
        nodes.push(current);
        pending.unshift(...(0, transport_1.getNodeChildren)(current));
    }
    return nodes;
}
function contentBytes(content) {
    if (content instanceof Uint8Array)
        return content.length;
    if (typeof content === 'string')
        return new TextEncoder().encode(content).length;
    return 0;
}
function parseInteger(value) {
    if (value === undefined || value === '')
        return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}
function summarizeAddress(content) {
    if (!(content instanceof Uint8Array)) {
        return {
            addressBytes: 0,
            addressFamily: 'missing',
            parseOutcome: 'ignored_missing_address'
        };
    }
    if (content.length < 6) {
        return {
            addressBytes: content.length,
            addressFamily: 'unsupported',
            parseOutcome: 'ignored_short_address'
        };
    }
    const parsed = (0, relay_address_js_1.parseRelayAddressBytes)(content);
    if (parsed) {
        return {
            addressBytes: content.length,
            addressFamily: parsed.addressFamily === 4 ? 'ipv4' : 'ipv6',
            ip: parsed.ip,
            port: parsed.port,
            parseOutcome: parsed.addressFamily === 4 ? 'parsed_ipv4' : 'parsed_ipv6'
        };
    }
    return {
        addressBytes: content.length,
        addressFamily: 'unsupported',
        parseOutcome: 'ignored_unsupported_address_length'
    };
}
function summarizeRelaySignaling(root) {
    const descendants = getDescendantNodes(root);
    const probes = [];
    const candidates = [];
    let relayNodeCount = 0;
    let participantNodeCount = 0;
    let tokenNodeCount = 0;
    let authTokenNodeCount = 0;
    let relayKeyNodeCount = 0;
    let hbhKeyNodeCount = 0;
    for (const node of descendants) {
        if (node.tag === 'relay')
            relayNodeCount++;
        if (node.tag === 'participant')
            participantNodeCount++;
        if (node.tag === 'te') {
            const encodedLatency = parseInteger(node.attrs?.latency);
            probes.push({
                relayName: node.attrs?.relay_name || '',
                encodedLatency,
                latency: encodedLatency === undefined
                    ? undefined
                    : Math.max(0, encodedLatency >= 0x2000000
                        ? encodedLatency - 0x2000000
                        : encodedLatency),
                ...summarizeAddress(node.content)
            });
        }
        if (node.tag !== 'relay')
            continue;
        const relayChildren = (0, transport_1.getNodeChildren)(node);
        const tokens = new Map();
        const authTokens = new Map();
        let relayKeyBytes = 0;
        for (const child of relayChildren) {
            if (child.tag === 'token') {
                tokenNodeCount++;
                tokens.set(child.attrs?.id || '0', contentBytes(child.content));
            }
            else if (child.tag === 'auth_token') {
                authTokenNodeCount++;
                authTokens.set(child.attrs?.id || '0', contentBytes(child.content));
            }
            else if (child.tag === 'key') {
                relayKeyNodeCount++;
                relayKeyBytes = contentBytes(child.content);
            }
            else if (child.tag === 'hbh_key') {
                hbhKeyNodeCount++;
            }
        }
        for (const child of relayChildren) {
            if (child.tag !== 'te2')
                continue;
            const tokenId = child.attrs?.token_id || '0';
            const authTokenId = child.attrs?.auth_token_id || undefined;
            const tokenBytes = tokens.get(tokenId) ?? 0;
            const authTokenBytes = authTokenId ? (authTokens.get(authTokenId) ?? 0) : 0;
            candidates.push({
                relayName: child.attrs?.relay_name || '',
                relayId: parseInteger(child.attrs?.relay_id),
                tokenId,
                authTokenId,
                protocol: parseInteger(child.attrs?.protocol) ?? 0,
                c2rRtt: parseInteger(child.attrs?.c2r_rtt),
                isFna: child.attrs?.is_fna === '1',
                tokenPresent: tokenBytes > 0,
                tokenBytes,
                authTokenPresent: authTokenBytes > 0,
                authTokenBytes,
                relayKeyPresent: relayKeyBytes > 0,
                relayKeyBytes,
                ...summarizeAddress(child.content)
            });
        }
    }
    return {
        relayNodeCount,
        participantNodeCount,
        tokenNodeCount,
        authTokenNodeCount,
        relayKeyNodeCount,
        hbhKeyNodeCount,
        probeCount: probes.length,
        candidateNodeCount: candidates.length,
        probes,
        candidates
    };
}
