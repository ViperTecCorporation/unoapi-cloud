export declare function buildSenderSubscriptions(ssrc: number): Uint8Array;
export declare function buildSSRCSubscriptionList(selfSsrcs: number[], peerSsrcs: number[], selfPid: number, peerPid: number): Uint8Array;
export declare function buildAllocateForRelay(senderSubscriptions: Uint8Array, ssrcList: Uint8Array, hmacKey: Uint8Array, relayIp?: string, relayPort?: number): Uint8Array;
export declare function buildBindingRequest(username: Uint8Array, hmacKey: Uint8Array | undefined, senderSubscriptions?: Uint8Array, includeIceControllingOrOptions?: boolean | {
    iceRole?: 'none' | 'controlling' | 'controlled';
    includePriority?: boolean;
    includeUsername?: boolean;
}): Uint8Array;
export declare function buildBindingRequestWithSubs(username: Uint8Array | undefined, hmacKey: Uint8Array | undefined, senderSubscriptions: Uint8Array | undefined, includeIceControlling: boolean, includeFingerprint: boolean): Uint8Array;
export declare function buildMinimalBindingWithSubs(senderSubscriptions: Uint8Array, includeFingerprint?: boolean): Uint8Array;
export declare function buildMinimalAllocateWithSubs(senderSubscriptions: Uint8Array, includeFingerprint?: boolean): Uint8Array;
export declare function buildAllocateRequest(username: Uint8Array, hmacKey: Uint8Array, lifetime?: number): Uint8Array;
export declare function buildWhatsAppPing(): Uint8Array;
export declare function isStunPacket(data: Uint8Array): boolean;
export declare function isRtpPacket(data: Uint8Array): boolean;
export interface StunResponseInfo {
    rawType: number;
    method: string;
    stunClass: string;
    isSuccess: boolean;
    isError: boolean;
    errorCode?: number;
    errorReason?: string;
    stableRoutingConnId?: bigint;
    transactionId: string;
    length: number;
    attributes: StunAttribute[];
}
interface StunAttribute {
    type: number;
    typeName: string;
    length: number;
    data: Uint8Array;
}
export declare function parseStunResponse(data: Uint8Array): StunResponseInfo | null;
export declare function formatStunResponse(info: StunResponseInfo): string;
export declare function classifyPacket(data: Uint8Array): string;
export {};
