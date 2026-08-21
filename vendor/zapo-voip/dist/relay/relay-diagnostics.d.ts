import { type BinaryNode } from 'zapo-js/transport';
export interface RelayAddressSummary {
    addressBytes: number;
    addressFamily: 'ipv4' | 'ipv6' | 'missing' | 'unsupported';
    ip?: string;
    port?: number;
    parseOutcome: 'parsed_ipv4' | 'parsed_ipv6' | 'ignored_missing_address' | 'ignored_short_address' | 'ignored_unsupported_address_length';
}
export interface RelayProbeSummary extends RelayAddressSummary {
    relayName: string;
    encodedLatency?: number;
    latency?: number;
}
export interface RelayCandidateSummary extends RelayAddressSummary {
    relayName: string;
    relayId?: number;
    tokenId: string;
    authTokenId?: string;
    protocol: number;
    c2rRtt?: number;
    isFna: boolean;
    tokenPresent: boolean;
    tokenBytes: number;
    authTokenPresent: boolean;
    authTokenBytes: number;
    relayKeyPresent: boolean;
    relayKeyBytes: number;
}
export interface RelaySignalingSummary {
    relayNodeCount: number;
    participantNodeCount: number;
    tokenNodeCount: number;
    authTokenNodeCount: number;
    relayKeyNodeCount: number;
    hbhKeyNodeCount: number;
    probeCount: number;
    candidateNodeCount: number;
    probes: RelayProbeSummary[];
    candidates: RelayCandidateSummary[];
}
export declare function summarizeRelaySignaling(root: BinaryNode): RelaySignalingSummary;
