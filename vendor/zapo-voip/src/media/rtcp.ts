import { TEXT_ENCODER, writeUInt16BE, writeUInt32BE } from '../bytes.js'

const NTP_UNIX_OFFSET_SECONDS = 2_208_988_800
const NTP_FRACTION_SCALE = 4_294_967_296
const WHATSAPP_RTCP_CNAME_LENGTH = 18

export interface RtcpSenderStats {
    packetsSent: number
    octetsSent: number
    rtpTimestamp: number
}

export function buildWhatsappRtcpCname(entropy: Uint8Array): Uint8Array {
    if (entropy.length < 12) {
        throw new Error(`RTCP CNAME entropy must contain at least 12 bytes, got ${entropy.length}`)
    }

    const hex = '0123456789abcdef'
    let randomHex = ''
    for (let nibble = 0; nibble < 11; nibble++) {
        const byte = entropy[6 + Math.floor(nibble / 2)]
        randomHex += hex[(nibble & 1) === 0 ? byte >> 4 : byte & 0x0f]
    }

    const cname = TEXT_ENCODER.encode(`${randomHex.slice(0, 5)}@pj${randomHex.slice(5)}.org`)
    if (cname.length !== WHATSAPP_RTCP_CNAME_LENGTH) {
        throw new Error(`invalid WhatsApp RTCP CNAME length: ${cname.length}`)
    }
    return cname
}

export function buildSenderReportWithSdes(
    ssrc: number,
    stats: RtcpSenderStats,
    nowMs: number,
    cname: Uint8Array
): Uint8Array {
    if (cname.length !== WHATSAPP_RTCP_CNAME_LENGTH) {
        throw new Error(`RTCP CNAME must contain ${WHATSAPP_RTCP_CNAME_LENGTH} bytes`)
    }

    const packet = new Uint8Array(60)

    // Sender Report: V=2, RC=0, PT=200, 28 bytes.
    packet[0] = 0x80
    packet[1] = 200
    writeUInt16BE(packet, 6, 2)
    writeUInt32BE(packet, ssrc, 4)

    const unixSeconds = Math.floor(nowMs / 1000)
    const ntpSeconds = (unixSeconds + NTP_UNIX_OFFSET_SECONDS) >>> 0
    const ntpFraction = Math.floor(((nowMs % 1000) / 1000) * NTP_FRACTION_SCALE) >>> 0
    writeUInt32BE(packet, ntpSeconds, 8)
    writeUInt32BE(packet, ntpFraction, 12)
    writeUInt32BE(packet, stats.rtpTimestamp, 16)
    writeUInt32BE(packet, stats.packetsSent, 20)
    writeUInt32BE(packet, stats.octetsSent, 24)

    // Source Description: V=2, SC=1, PT=202, 32 bytes.
    packet[28] = 0x81
    packet[29] = 202
    writeUInt16BE(packet, 7, 30)
    writeUInt32BE(packet, ssrc, 32)
    packet[36] = 1
    packet[37] = WHATSAPP_RTCP_CNAME_LENGTH
    packet.set(cname, 38)

    return packet
}
