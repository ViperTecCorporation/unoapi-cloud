export type VoipCodecMode = 'mlow' | 'opus';
export interface ParsedVoipSettings {
    readonly codecMode: VoipCodecMode;
    readonly useMlowCodecV1: boolean;
    readonly frameMs: number;
    readonly targetBitrate: number;
    readonly present: boolean;
    readonly malformed: boolean;
}
export declare function parseVoipSettings(raw: Uint8Array | string | null | undefined): ParsedVoipSettings;
interface VoipSettingsNodeLike {
    readonly tag?: string;
    readonly content?: unknown;
}
export declare function parseVoipSettingsFromNode(node: VoipSettingsNodeLike): ParsedVoipSettings;
export {};
