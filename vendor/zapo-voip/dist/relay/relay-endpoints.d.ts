import type { RelayEndpoint } from '../types.js';
export interface NormalizedRelayEndpoint {
    ip: string;
    port: number;
    token: string;
    authToken?: string;
    rawAuthToken?: Uint8Array;
    rawToken?: Uint8Array;
    key: string;
    relayId: number;
    name: string;
    authTokenId?: string;
    isFna?: boolean;
}
export declare function normalizeRelayEndpoints(endpoints: readonly RelayEndpoint[]): NormalizedRelayEndpoint[];
