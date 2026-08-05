import { writeBigUInt64BE, writeUInt32BE } from '../bytes.js'
import type { SrtpKeyingMaterial } from '../types.js'

import { aesCtr128, hmacSha1, randomBytes } from './primitives.js'
import { buildSenderReportWithSdes, buildWhatsappRtcpCname, type RtcpSenderStats } from '../media/rtcp.js'

const SRTCP_ENCRYPTION_LABEL = 0x03
const SRTCP_AUTH_LABEL = 0x04
const SRTCP_SALT_LABEL = 0x05
const SRTCP_AUTH_TAG_LENGTH = 10
const SRTCP_CLEAR_HEADER_LENGTH = 8
const SRTCP_INDEX_ENCRYPTED_FLAG = 0x80000000

export class SrtcpSender {
    private readonly ssrc: number
    private readonly sessionKey: Uint8Array
    private readonly sessionSalt: Uint8Array
    private readonly authKey: Uint8Array
    private readonly cname: Uint8Array
    private index = 1

    constructor(keying: SrtpKeyingMaterial, ssrc: number, entropy = randomBytes(12)) {
        this.ssrc = ssrc >>> 0
        this.sessionKey = deriveKey(
            keying.masterKey,
            keying.masterSalt,
            SRTCP_ENCRYPTION_LABEL,
            16
        )
        this.authKey = deriveKey(
            keying.masterKey,
            keying.masterSalt,
            SRTCP_AUTH_LABEL,
            20
        )
        this.sessionSalt = deriveKey(
            keying.masterKey,
            keying.masterSalt,
            SRTCP_SALT_LABEL,
            14
        )
        this.cname = buildWhatsappRtcpCname(entropy)
    }

    createSenderReport(stats: RtcpSenderStats, nowMs = Date.now()): Uint8Array {
        const plain = buildSenderReportWithSdes(this.ssrc, stats, nowMs, this.cname)
        const protectedPacket = this.protect(plain, this.index)
        this.index = (this.index + 1) & 0x7fffffff
        if (this.index === 0) this.index = 1
        return protectedPacket
    }

    private protect(rtcp: Uint8Array, index: number): Uint8Array {
        const clearLength = Math.min(rtcp.length, SRTCP_CLEAR_HEADER_LENGTH)
        const output = new Uint8Array(rtcp.length + 4 + SRTCP_AUTH_TAG_LENGTH)
        output.set(rtcp.subarray(0, clearLength), 0)

        const iv = this.generateIv(index)
        const encryptedBody = aesCtr128(this.sessionKey, iv, rtcp.subarray(clearLength))
        output.set(encryptedBody, clearLength)

        const indexOffset = rtcp.length
        writeUInt32BE(output, (SRTCP_INDEX_ENCRYPTED_FLAG | index) >>> 0, indexOffset)

        const authenticated = output.subarray(0, indexOffset + 4)
        const tag = hmacSha1(this.authKey, authenticated).subarray(0, SRTCP_AUTH_TAG_LENGTH)
        output.set(tag, indexOffset + 4)
        return output
    }

    private generateIv(index: number): Uint8Array {
        const iv = new Uint8Array(16)
        iv.set(this.sessionSalt, 0)

        const ssrcBuffer = new Uint8Array(4)
        writeUInt32BE(ssrcBuffer, this.ssrc, 0)
        for (let i = 0; i < 4; i++) iv[4 + i] ^= ssrcBuffer[i]

        const indexBuffer = new Uint8Array(8)
        writeBigUInt64BE(indexBuffer, BigInt(index >>> 0), 0)
        for (let i = 0; i < 6; i++) iv[8 + i] ^= indexBuffer[2 + i]
        return iv
    }
}

function deriveKey(
    masterKey: Uint8Array,
    masterSalt: Uint8Array,
    label: number,
    length: number
): Uint8Array {
    const iv = new Uint8Array(16)
    iv.set(masterSalt.subarray(0, 14), 0)
    iv[7] ^= label
    return aesCtr128(masterKey, iv, new Uint8Array(length))
}
