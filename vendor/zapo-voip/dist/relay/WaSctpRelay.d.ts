import { EventEmitter } from 'node:events';
import { type Logger } from 'zapo-js';
import { NativeRelayTransport } from './NativeRelayTransport.js';
export declare const WA_RELAY_DATA_CHANNEL_ID = 0;
export declare const WA_RELAY_DATA_CHANNEL_LABEL = "pre-negotiated";
declare enum ConnectionState {
    None = "None",
    Connecting = "Connecting",
    Open = "Open",
    Closed = "Closed",
    Failed = "Failed"
}
interface RelayInfo {
    id: string;
    ip: string;
    port: number;
    token: string;
    authToken?: string;
    rawAuthToken?: Uint8Array;
    rawToken?: Uint8Array;
    key: string;
    relayId: number;
    name?: string;
    tokenId?: string;
    authTokenId?: string;
    isFna?: boolean;
}
interface Connection {
    state: ConnectionState;
    nativeTransport: NativeRelayTransport | null;
    buffer: ArrayBuffer[];
    bufferedBytes: number;
    id: string;
    relayInfo: RelayInfo;
    connectionTimeout: NodeJS.Timeout | null;
    hasReceivedFirstPacket: boolean;
    hasReceivedFirstRtp: boolean;
    stableRoutingConnId: bigint;
    cachedAllocate: Uint8Array | null;
    stats: {
        sentPackets: number;
        receivedPackets: number;
        sentBytes: number;
        receivedBytes: number;
    };
}
export interface WaSctpRelayOptions {
    readonly logger?: Logger;
    readonly nativeTransportFactory?: (options: ConstructorParameters<typeof NativeRelayTransport>[0]) => NativeRelayTransport;
}
export interface RelayReceiveStats {
    readonly rtp: number;
    readonly rtcp: number;
    readonly pongs: number;
    readonly received: number;
    readonly readyConnections: number;
    readonly lastControlResponseAt: number;
}
export declare class WaSctpRelay extends EventEmitter {
    private readonly logger;
    private readonly nativeTransportFactory;
    private connections;
    private relayMap;
    private stats;
    private configuring;
    private globalBuffer;
    private globalBufferedBytes;
    private keepaliveTimers;
    private audioSsrc;
    private subscriptionSsrc;
    private subscriptionSsrcs;
    private streamSsrcs;
    private selfPid;
    private peerPid;
    private readyConnectionIds;
    private mediaConnectionId;
    private mediaConnectionConfirmed;
    private mediaPendingSelectionDropCount;
    private startupMediaFanoutEnabled;
    private startupMediaFanoutLogCount;
    constructor(options?: WaSctpRelayOptions);
    setSsrc(ssrc: number): void;
    setSubscriptionSsrc(ssrc: number): void;
    setSubscriptionSsrcs(ssrcs: readonly number[]): void;
    setStreamSsrcs(ssrcs: readonly number[]): void;
    setParticipantPids(selfPid?: number, peerPid?: number): void;
    setStartupMediaFanout(enabled: boolean): void;
    hasReadyConnection(): boolean;
    getReadyConnectionCount(): number;
    getConfiguredRelayCount(): number;
    getReceiveStats(): RelayReceiveStats;
    selectMediaConnection(connectionId: string, confirmed?: boolean): boolean;
    selectMediaConnectionByRelayId(relayId: number): boolean;
    waitForReadyCount(minimumCount?: number, timeoutMs?: number): Promise<number>;
    waitForReady(timeoutMs?: number): Promise<boolean>;
    resendSubscriptions(): void;
    private makeConnectionId;
    connectToRelay(relayInfo: RelayInfo): Promise<Connection | null>;
    private failConnection;
    private isConnOpen;
    private findConnectionByIpPort;
    private sendStunAllocateOnOpen;
    private startKeepalive;
    private stopKeepalive;
    private closeConnection;
    private drainBuffer;
    private sendCount;
    private sendToChannel;
    private pongCount;
    private rtpRecvCount;
    private rtcpRecvCount;
    private remoteRtpRecvCount;
    private remoteRtcpRecvCount;
    private unknownRecvCount;
    private lastControlResponseAt;
    private handleRelayMessage;
    private isPong;
    configureRelays(relays: Array<{
        ip: string;
        port: number;
        token: string;
        authToken?: string;
        rawAuthToken?: Uint8Array;
        rawToken?: Uint8Array;
        key: string;
        relayId: number;
        name?: string;
        tokenId?: string;
        authTokenId?: string;
        isFna?: boolean;
    }>): Promise<void>;
    sendToRelay(ip: string, port: number, data: ArrayBuffer): boolean;
    private bufferData;
    broadcast(data: ArrayBuffer): void;
    hasConnection(): boolean;
    getConnectedCount(): number;
    /**
     * Closes only the native relay transport state. Media identities and the
     * current SRTP/codec session are deliberately preserved so a caller can
     * configure the next advertised candidate without rebuilding the call.
     */
    resetTransport(reason?: string): void;
    cleanup(): void;
}
export {};
