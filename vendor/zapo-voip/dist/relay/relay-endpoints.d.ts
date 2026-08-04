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
/**
 * Selects the single media relay used by WhatsApp Web.
 * Incoming calls must bind to the caller's FNA relay; outgoing calls prefer
 * the authenticated non-FNA relay. Allocating every advertised relay creates
 * parallel bindings and prevents the peer media from being bridged.
 */
export declare function selectMediaRelayEndpoint(endpoints: readonly RelayEndpoint[], incoming: boolean): RelayEndpoint | undefined;
export declare function normalizeRelayEndpoints(endpoints: readonly RelayEndpoint[], options?: {
    includeWebTokenFallback?: boolean;
}): NormalizedRelayEndpoint[];
