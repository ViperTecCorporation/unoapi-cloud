export type RelayAddressFamily = 4 | 6;
export interface ParsedRelayAddress {
    readonly ip: string;
    readonly port: number;
    readonly addressFamily: RelayAddressFamily;
    readonly addressBytes: Uint8Array;
}
export declare function parseRelayAddressBytes(content: Uint8Array): ParsedRelayAddress | undefined;
export declare function parseIpAddressBytes(ip: string): {
    readonly addressFamily: RelayAddressFamily;
    readonly bytes: Uint8Array;
};
