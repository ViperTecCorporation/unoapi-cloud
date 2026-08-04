"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeCallStanza = routeCallStanza;
exports.routeCallAck = routeCallAck;
exports.routeCallReceipt = routeCallReceipt;
const zapo_js_1 = require("zapo-js");
const protocol_1 = require("zapo-js/protocol");
const transport_1 = require("zapo-js/transport");
const util_1 = require("zapo-js/util");
const RECEIPT_CALL_TAGS = new Set([
    'offer',
    'accept',
    'preaccept',
    'terminate',
    'transport',
    'relaylatency',
    'mute_v2'
]);
async function routeCallStanza(manager, deps, node, logger) {
    const log = logger ?? (0, zapo_js_1.createNoopLogger)();
    const inner = (0, transport_1.getFirstNodeChild)(node);
    if (!inner)
        return null;
    const tag = inner.tag;
    const peerJid = node.attrs.from;
    await deps.lowLevelCoordinator.sendNode((0, transport_1.buildAckNode)({
        kind: 'custom',
        ackClass: 'call',
        to: peerJid,
        id: node.attrs.id,
        type: tag
    }));
    let normalizedPeerJid;
    try {
        normalizedPeerJid = (0, protocol_1.normalizeDeviceJid)(peerJid);
    }
    catch (err) {
        log.warn('failed to normalize call peer jid', {
            from: peerJid,
            message: (0, util_1.toError)(err).message
        });
        return tag;
    }
    switch (tag) {
        case 'offer':
            await manager.handleCallOffer(node, normalizedPeerJid);
            break;
        case 'preaccept':
            await manager.handleCallPreaccept(node, normalizedPeerJid);
            break;
        case 'accept':
            await manager.handleCallAccept(node, normalizedPeerJid);
            break;
        case 'transport':
            await manager.handleCallTransport(node, normalizedPeerJid);
            break;
        case 'terminate':
            await manager.handleCallTerminate(node);
            break;
        case 'relaylatency':
            await manager.handleCallRelaylatency(node, normalizedPeerJid);
            break;
        case 'mute_v2':
            await manager.handleCallMuteV2(node, normalizedPeerJid);
            break;
        case 'relay_election':
            manager.handleRelayElection(node);
            break;
        case 'reject':
            await manager.handleCallReject(node);
            break;
        default:
            break;
    }
    return tag;
}
async function routeCallAck(manager, node) {
    await manager.handleCallAck(node);
}
async function routeCallReceipt(deps, node) {
    const inner = (0, transport_1.getFirstNodeChild)(node);
    if (!inner)
        return false;
    if (!RECEIPT_CALL_TAGS.has(inner.tag))
        return false;
    const peerJid = node.attrs.from;
    await deps.lowLevelCoordinator.sendNode((0, transport_1.buildAckNode)({
        kind: 'custom',
        ackClass: 'receipt',
        to: peerJid,
        id: node.attrs.id,
        type: node.attrs.type || 'retry'
    }));
    return true;
}
