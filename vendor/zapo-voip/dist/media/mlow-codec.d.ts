export interface MLowCodecOptions {
    readonly bitrate?: number;
    readonly complexity?: number;
    readonly fec?: boolean;
}
export declare class MLowCodec {
    private encoder;
    private decoder;
    private readonly frameSize;
    private decodeErrors;
    private decodeSuccess;
    private plcFrames;
    private opts;
    private constructor();
    static create(opts?: MLowCodecOptions): Promise<MLowCodec>;
    private init;
    encode(float32Audio: Float32Array): Uint8Array;
    decode(mlowFrame: Uint8Array | null): Float32Array;
    private silence;
    getStats(): {
        success: number;
        errors: number;
        plc: number;
    };
    getFrameSize(): number;
    getFrameDurationMs(): number;
    getSampleRate(): number;
    reset(): Promise<void>;
    destroy(): void;
}
