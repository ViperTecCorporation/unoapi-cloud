export interface MLowCodecOptions {
    readonly bitrate?: number;
    readonly complexity?: number;
    readonly fec?: boolean;
    readonly mode?: AudioCodecMode;
    readonly useSmpl?: boolean;
}
export type AudioCodecMode = 'mlow' | 'opus';
export declare class MLowCodec {
    private encoder;
    private decoder;
    private readonly frameSize;
    private decodeErrors;
    private decodeSuccess;
    private plcFrames;
    private opts;
    private mode;
    private constructor();
    static create(opts?: MLowCodecOptions): Promise<MLowCodec>;
    private init;
    encode(float32Audio: Float32Array): Uint8Array;
    decode(encodedFrame: Uint8Array | null): Float32Array;
    private silence;
    getStats(): {
        success: number;
        errors: number;
        plc: number;
    };
    getFrameSize(): number;
    getFrameDurationMs(): number;
    getSampleRate(): number;
    getMode(): AudioCodecMode;
    usesSmpl(): boolean;
    reset(): Promise<void>;
    destroy(): void;
}
