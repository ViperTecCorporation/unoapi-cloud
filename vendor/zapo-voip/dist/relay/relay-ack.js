"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRelayFromAck = parseRelayFromAck;
const transport_1 = require("zapo-js/transport");
const util_1 = require("zapo-js/util");
const bytes_js_1 = require("../bytes.js");
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
function parseRelayFromAck(ackNode) {
    const relays = [];
    const participantJids = [];
    const participantSeen = new Set();
    let uuid = '';
    let selfPid;
    let peerPid;
    let selfParticipantJid;
    let peerParticipantJid;
    let hbhKey;
    for (const child of getDescendantNodes(ackNode)) {
        if (child.tag === 'user' && Array.isArray(child.content)) {
            for (const deviceNode of child.content) {
                if (typeof deviceNode === 'object' &&
                    'tag' in deviceNode &&
                    deviceNode.tag === 'device' &&
                    deviceNode.attrs?.jid) {
                    const jid = deviceNode.attrs.jid;
                    if (!participantSeen.has(jid)) {
                        participantSeen.add(jid);
                        participantJids.push(jid);
                    }
                }
            }
        }
        if (child.tag !== 'relay')
            continue;
        const relayNode = child;
        uuid = relayNode.attrs?.uuid || '';
        if (relayNode.attrs?.self_pid)
            selfPid = parseInt(relayNode.attrs.self_pid, 10);
        if (relayNode.attrs?.peer_pid)
            peerPid = parseInt(relayNode.attrs.peer_pid, 10);
        const relayContent = (0, transport_1.getNodeChildren)(relayNode);
        for (const rc of (0, transport_1.getNodeChildrenByTag)(relayNode, 'participant')) {
            const jid = rc.attrs?.jid;
            const participantPid = rc.attrs?.pid ? parseInt(rc.attrs.pid, 10) : undefined;
            if (jid && !participantSeen.has(jid)) {
                participantSeen.add(jid);
                participantJids.push(jid);
            }
            if (jid && participantPid === selfPid)
                selfParticipantJid = jid;
            if (jid && participantPid === peerPid)
                peerParticipantJid = jid;
        }
        let relayKey = '';
        const tokens = new Map();
        const authTokens = new Map();
        const rawTokens = new Map();
        const rawAuthTokens = new Map();
        for (const rc of relayContent) {
            if (typeof rc !== 'object' || !('tag' in rc))
                continue;
            const rcNode = rc;
            if (rcNode.tag === 'key' && rcNode.content) {
                relayKey = (0, transport_1.getNodeTextContent)(rcNode) ?? '';
            }
            if (rcNode.tag === 'hbh_key' && rcNode.content) {
                let rawKey;
                if (rcNode.content instanceof Uint8Array) {
                    rawKey = rcNode.content;
                }
                else if (typeof rcNode.content === 'string') {
                    rawKey = (0, util_1.base64ToBytes)(rcNode.content);
                }
                if (rawKey) {
                    if (rawKey.length === 30) {
                        hbhKey = rawKey;
                    }
                    else if (rawKey.length > 30) {
                        const asB64 = bytes_js_1.TEXT_DECODER.decode(rawKey).trim();
                        const decoded = (0, util_1.base64ToBytes)(asB64);
                        if (decoded.length === 30)
                            hbhKey = decoded;
                    }
                }
            }
            if (rcNode.tag === 'token' && rcNode.content) {
                const tokenId = rcNode.attrs?.id || '0';
                const tokenData = rcNode.content instanceof Uint8Array
                    ? (0, util_1.bytesToBase64)(rcNode.content)
                    : String(rcNode.content);
                tokens.set(tokenId, tokenData);
                if (rcNode.content instanceof Uint8Array) {
                    rawTokens.set(tokenId, rcNode.content);
                }
                else if (typeof rcNode.content === 'string') {
                    rawTokens.set(tokenId, bytes_js_1.TEXT_ENCODER.encode(rcNode.content));
                }
            }
            if (rcNode.tag === 'auth_token' && rcNode.content) {
                const authTokenId = rcNode.attrs?.id || '0';
                const authTokenData = rcNode.content instanceof Uint8Array
                    ? (0, util_1.bytesToBase64)(rcNode.content)
                    : String(rcNode.content);
                authTokens.set(authTokenId, authTokenData);
                if (rcNode.content instanceof Uint8Array) {
                    rawAuthTokens.set(authTokenId, rcNode.content);
                }
                else if (typeof rcNode.content === 'string') {
                    rawAuthTokens.set(authTokenId, bytes_js_1.TEXT_ENCODER.encode(rcNode.content));
                }
            }
        }
        for (const rcNode of (0, transport_1.getNodeChildrenByTag)(relayNode, 'te2')) {
            const tokenId = rcNode.attrs?.token_id || '0';
            const authTokenId = rcNode.attrs?.auth_token_id || '';
            const token = tokens.get(tokenId) || '';
            const authToken = authTokenId ? authTokens.get(authTokenId) : undefined;
            const relayName = rcNode.attrs?.relay_name || '';
            const protocol = rcNode.attrs?.protocol ? parseInt(rcNode.attrs.protocol, 10) : 0;
            const isFna = rcNode.attrs?.is_fna === '1';
            if (!(rcNode.content instanceof Uint8Array))
                continue;
            const address = (0, relay_address_js_1.parseRelayAddressBytes)(rcNode.content);
            if (address) {
                relays.push({
                    ip: address.ip,
                    port: address.port,
                    addressFamily: address.addressFamily,
                    token,
                    authToken,
                    rawAuthToken: authTokenId ? rawAuthTokens.get(authTokenId) : undefined,
                    rawToken: rawTokens.get(tokenId),
                    key: relayKey,
                    relayId: parseInt(rcNode.attrs?.relay_id || '0', 10),
                    protocol,
                    c2rRtt: rcNode.attrs?.c2r_rtt ? parseInt(rcNode.attrs.c2r_rtt, 10) : undefined,
                    relayName,
                    addressBytes: address.addressBytes,
                    tokenId,
                    authTokenId: authTokenId || undefined,
                    isFna
                });
            }
        }
    }
    return {
        relays,
        participantJids,
        selfParticipantJid,
        peerParticipantJid,
        uuid,
        selfPid,
        peerPid,
        hbhKey
    };
}
