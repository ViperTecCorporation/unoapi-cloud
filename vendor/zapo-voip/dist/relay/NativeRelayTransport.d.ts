import { type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { type Logger } from 'zapo-js';
export type NativeRelayTransportState = 'connecting' | 'open' | 'closed' | 'failed';
type SpawnRelayBridge = (command: string, args: readonly string[]) => ChildProcessWithoutNullStreams;
export interface NativeRelayTransportOptions {
    readonly host: string;
    readonly port: number;
    readonly logger?: Logger;
    readonly binaryPath?: string;
    readonly spawnBridge?: SpawnRelayBridge;
}
export declare function resolveRelayBridgeBinary(explicitPath?: string): string;
export declare class NativeRelayTransport extends EventEmitter {
    private readonly logger;
    private readonly process;
    private stdoutBuffer;
    private stateValue;
    private closedByOwner;
    constructor(options: NativeRelayTransportOptions);
    get state(): NativeRelayTransportState;
    get isOpen(): boolean;
    send(data: Uint8Array): boolean;
    close(): void;
    private consumeStdout;
    private handleFrame;
    private fail;
}
export {};
