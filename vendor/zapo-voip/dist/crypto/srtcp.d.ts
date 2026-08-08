import type { SrtpKeyingMaterial } from '../types.js';
import { type RtcpSenderStats } from '../media/rtcp.js';
export declare class SrtcpSender {
    private readonly ssrc;
    private readonly sessionKey;
    private readonly sessionSalt;
    private readonly authKey;
    private readonly cname;
    private index;
    constructor(keying: SrtpKeyingMaterial, ssrc: number, entropy?: Uint8Array<ArrayBufferLike>);
    createSenderReport(stats: RtcpSenderStats, nowMs?: number): Uint8Array;
    private protect;
    private generateIv;
}
