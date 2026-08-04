import { type Logger } from 'zapo-js';
import { proto } from 'zapo-js/proto';
import { type BinaryNode } from 'zapo-js/transport';
import type { NodeInfo, RelayEndpoint, WaVoipDeps, WaVoipStores } from '../types.js';
export declare function encodeWAMessage(message: Parameters<typeof proto.Message.encode>[0]): Promise<Uint8Array>;
export declare function generateCallId(): string;
export declare function generateCallStanzaId(): string;
export declare function extractNodeInfo(node: BinaryNode): NodeInfo | null;
export declare function extractRelayEndpoints(node: BinaryNode): RelayEndpoint[];
export declare function decryptCallKey(deps: WaVoipDeps, node: BinaryNode, peerJid: string, logger?: Logger): Promise<Uint8Array | undefined>;
export interface CallParticipantNodes {
    nodes: BinaryNode[];
    shouldIncludeDeviceIdentity: boolean;
}
export declare function buildCallParticipantNodes(deps: WaVoipDeps, devices: string[], callKey: Uint8Array): Promise<CallParticipantNodes>;
export declare function buildOfferStanza(deps: WaVoipDeps, stores: WaVoipStores, callId: string, callKey: Uint8Array, peerJid: string, isVideo: boolean, logger?: Logger, peerDevices?: readonly string[]): Promise<BinaryNode>;
export declare function buildAcceptStanza(deps: WaVoipDeps, callId: string, callKey: Uint8Array, peerJid: string, callCreator: string, isVideo: boolean): Promise<BinaryNode>;
export declare function buildTerminateStanza(peerJid: string, callId: string, callCreator: string, audioDurationMs?: number, reason?: string): BinaryNode;
export declare function buildRelaylatencyForwardStanza(peerJid: string, callId: string, callCreator: string, teNodes: readonly BinaryNode[], destinationJids: string[]): BinaryNode;
export declare function buildRejectStanza(peerJid: string, callId: string, callCreator: string): BinaryNode;
export declare function buildPreacceptStanza(peerJid: string, callId: string, callCreator: string): BinaryNode;
export declare function buildRelayLatencyStanza(peerJid: string, callId: string, callCreator: string, relays: Array<{
    relayName: string;
    latency: number;
    addressBytes?: Uint8Array;
}>, destinationJids: string[], meId: string): BinaryNode;
export declare function buildTransportStanza(peerJid: string, callId: string, callCreator: string, meId: string, messageType?: string, p2pCandRound?: string): BinaryNode;
export declare function buildMuteV2Stanza(peerDeviceJid: string, callId: string, callCreator: string, muteState: number, meId: string): BinaryNode;
export declare function buildAcceptReceiptStanza(peerDeviceJid: string, acceptMsgId: string, callId: string, callCreator: string, ourJid: string): BinaryNode;
export declare const ENCRYPTED_TAGS: readonly ["preaccept", "accept"];
export declare function needsDecryption(tag: string): boolean;
