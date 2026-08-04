export declare function randomBytes(length: number): Uint8Array;
export declare function randomInt(min: number, max: number): number;
export declare function hmacSha1(key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array;
export declare function aesCtr128(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array;
