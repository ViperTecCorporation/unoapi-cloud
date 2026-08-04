import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { type Logger } from 'zapo-js';
type PeerConnectionClass = RTCPeerConnection;
type DataChannelClass = RTCDataChannel;
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
    authTokenId?: string;
    isFna?: boolean;
}
interface Connection {
    state: ConnectionState;
    peerConnection: PeerConnectionClass | null;
    channel: DataChannelClass | null;
    udpSocket: dgram.Socket | null;
    incomingChannels: DataChannelClass[];
    buffer: ArrayBuffer[];
    bufferedBytes: number;
    id: string;
    relayInfo: RelayInfo;
    connectionTimeout: NodeJS.Timeout | null;
    hasReceivedFirstPacket: boolean;
    localUfrag: string;
    stableRoutingConnId: bigint;
    stats: {
        sentPackets: number;
        receivedPackets: number;
        sentBytes: number;
        receivedBytes: number;
    };
}
export interface WaSctpRelayOptions {
    readonly logger?: Logger;
}
export declare class WaSctpRelay extends EventEmitter {
    private readonly logger;
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
    private selfPid;
    private peerPid;
    constructor(options?: WaSctpRelayOptions);
    setSsrc(ssrc: number): void;
    setSubscriptionSsrc(ssrc: number): void;
    setSubscriptionSsrcs(ssrcs: readonly number[]): void;
    setParticipantPids(selfPid?: number, peerPid?: number): void;
    resendSubscriptions(): void;
    private addRelayCandidate;
    private modifySdpForRelay;
    private makeConnectionId;
    connectToRelay(relayInfo: RelayInfo): Promise<Connection | null>;
    private failConnection;
    private isConnOpen;
    private setupUdpRelay;
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
    private unknownRecvCount;
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
        authTokenId?: string;
        isFna?: boolean;
    }>): Promise<void>;
    sendToRelay(ip: string, port: number, data: ArrayBuffer): boolean;
    private bufferData;
    broadcast(data: ArrayBuffer): void;
    hasConnection(): boolean;
    getConnectedCount(): number;
    cleanup(): void;
}
export {};
