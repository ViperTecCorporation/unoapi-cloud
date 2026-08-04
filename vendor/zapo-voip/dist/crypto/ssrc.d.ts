export declare function formatE2ESrtpParticipantId(jid: string): string;
export declare function e2eParticipantIdVariants(jid: string): string[];
export declare function generateSecureSsrc(callId: string, selfJid: string, counter?: number): number;
export declare const WASM_RELAY_STREAM_SLOT_WORDS: readonly [0, 1, 4, 2, 3, 5, 7, 8, 6];
export declare function generateWasmRelayStreamSsrcs(callId: string, participantJid: string): number[];
export declare function prepareWasmRelayStreamSsrcs(streamSsrcs: readonly number[], appDataSsrc: number, randomSource?: (length: number) => Uint8Array): number[];
