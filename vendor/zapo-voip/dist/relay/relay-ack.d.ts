import { type BinaryNode } from 'zapo-js/transport';
import type { RelayEndpoint } from '../types.js';
export declare function parseRelayFromAck(ackNode: BinaryNode): {
    relays: RelayEndpoint[];
    participantJids: string[];
    uuid: string;
    selfPid?: number;
    peerPid?: number;
    hbhKey?: Uint8Array;
};
