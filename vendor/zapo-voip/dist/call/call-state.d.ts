import { CallDirection, CallMediaType, CallState, type CallTransition, type EndCallReason, type RelayData } from '../types.js';
export interface CallStateData {
    state: CallState;
    connectedAt?: Date;
    acceptedAt?: Date;
    endedAt?: Date;
    audioMuted: boolean;
    videoOff: boolean;
    silenced?: boolean;
    /** Incoming call waiting for a free slot; cannot accept until unblocked. */
    acceptBlocked?: boolean;
    endReason?: EndCallReason;
    durationSecs?: number;
}
export declare class CallInfo {
    callId: string;
    peerJid: string;
    callCreator: string;
    direction: CallDirection;
    mediaType: CallMediaType;
    stateData: CallStateData;
    createdAt: Date;
    groupJid?: string;
    isOffline: boolean;
    callerPn?: string;
    encryptionKey?: Uint8Array;
    relayData?: RelayData;
    electedRelayIdx?: number;
    private constructor();
    static newOutgoing(callId: string, peerJid: string, ourJid: string, mediaType: CallMediaType): CallInfo;
    static newIncoming(callId: string, peerJid: string, callCreator: string, callerPn: string | undefined, mediaType: CallMediaType): CallInfo;
    get isInitiator(): boolean;
    get isActive(): boolean;
    get isRinging(): boolean;
    get isEnded(): boolean;
    get canAccept(): boolean;
    get isAcceptBlocked(): boolean;
    get canReject(): boolean;
    applyTransition(transition: CallTransition): void;
}
export declare class InvalidTransition extends Error {
    currentState: string;
    attempted: string;
    constructor(currentState: string, attempted: string);
}
