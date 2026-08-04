import { type Logger } from 'zapo-js';
import { type AudioSender, type WaAudioEngineConfig } from '../types.js';
export interface WaAudioEngineOptions extends Partial<WaAudioEngineConfig> {
    readonly logger?: Logger;
}
export declare class WaAudioEngine {
    private readonly logger;
    private audioSender;
    private audioBuffer;
    private audioPosition;
    private audioFinished;
    private onAudioFinished;
    private playbackInterval;
    private captureInterval;
    private circularBuffer;
    private bufferWritePos;
    private bufferReadPos;
    private bufferLength;
    private readonly sampleRate;
    private readonly captureChunkSize;
    private readonly maxBuffer;
    private readonly outputSize;
    private readonly intervalMs;
    private silenceMode;
    private externalMode;
    private liveWritePos;
    private extStarted;
    private readonly extPreBufferSize;
    private readonly extTargetBuffer;
    private readonly extHighWater;
    private readonly extMaxBuffer;
    private extSkipCount;
    private extDropCount;
    private readonly captureChunkBuffer;
    private readonly silenceChunkBuffer;
    private readonly playbackOutputBuffer;
    constructor(config?: WaAudioEngineOptions);
    setAudioSender(sender: AudioSender): void;
    setOnAudioFinished(callback: (() => void) | null): void;
    setExternalMode(enabled: boolean): void;
    isExternalMode(): boolean;
    /**
     * Append live PCM to the external-mode buffer and return the buffered
     * level in milliseconds. Bounded: an oversized chunk keeps only its tail,
     * and overflow drops the oldest samples, so the buffer never grows past
     * its cap.
     */
    feedExternalAudio(data: Float32Array): number;
    getLiveBufferMs(): number;
    /**
     * Backpressure watermarks for the live feed, in milliseconds: pause a
     * producer once the buffered level reaches `pauseMs`, resume once it drains
     * to `resumeMs`. Derived from the engine config, independent of any call.
     */
    static feedWatermarksMs(): {
        pauseMs: number;
        resumeMs: number;
    };
    isAudioFinished(): boolean;
    loadAudioFile(audioPath: string): Promise<void>;
    private int16ToFloat32;
    private decodeWithFFmpeg;
    generateTestTone(frequency?: number, duration?: number, amplitude?: number): void;
    startPlayback(): void;
    stopPlayback(): void;
    onPlaybackData(audioData: Float32Array): void;
    startSilenceCapture(): void;
    startCapture(): void;
    stopCapture(): void;
    stop(): void;
    hasAudio(): boolean;
    private resetBuffer;
    private writeToBuffer;
    private readFromBuffer;
    private getNextChunk;
}
