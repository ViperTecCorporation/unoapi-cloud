export declare function isOpusDtxPayload(payload: Uint8Array): boolean;
export declare class RtpHeader {
    version: number;
    padding: boolean;
    extension: boolean;
    marker: boolean;
    payloadType: number;
    sequenceNumber: number;
    timestamp: number;
    ssrc: number;
    csrc: number[];
    extensionProfile: number;
    extensionData: Uint8Array;
    get csrcCount(): number;
    constructor(payloadType: number, sequenceNumber: number, timestamp: number, ssrc: number);
    size(): number;
    encode(buf: Uint8Array): number;
    static decode(buf: Uint8Array): RtpHeader;
}
export declare class RtpPacket {
    header: RtpHeader;
    payload: Uint8Array;
    constructor(header: RtpHeader, payload: Uint8Array);
    size(): number;
    encode(): Uint8Array;
    static decode(buf: Uint8Array): RtpPacket;
}
export declare class RtpSession {
    private ssrc;
    private payloadType;
    private sequenceNumber;
    private sampleRate;
    private timestamp;
    private samplesPerPacket;
    constructor(ssrc: number, payloadType: number, sampleRate: number, samplesPerPacket: number);
    static whatsappOpus(ssrc: number): RtpSession;
    createPacket(payload: Uint8Array, marker?: boolean): RtpPacket;
    createPacketWithDuration(payload: Uint8Array, durationSamples: number, marker?: boolean): RtpPacket;
}
