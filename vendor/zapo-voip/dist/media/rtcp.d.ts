export interface RtcpSenderStats {
    packetsSent: number;
    octetsSent: number;
    rtpTimestamp: number;
}
export declare function buildWhatsappRtcpCname(entropy: Uint8Array): Uint8Array;
export declare function buildSenderReportWithSdes(ssrc: number, stats: RtcpSenderStats, nowMs: number, cname: Uint8Array): Uint8Array;
