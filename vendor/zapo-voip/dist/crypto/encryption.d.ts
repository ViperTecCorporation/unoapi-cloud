import type { SrtpKeyingMaterial } from '../types.js';
export declare function derivePerJidSrtpKey(callKey: Uint8Array, deviceJid: string): SrtpKeyingMaterial;
export declare function generateCallKey(): Uint8Array;
