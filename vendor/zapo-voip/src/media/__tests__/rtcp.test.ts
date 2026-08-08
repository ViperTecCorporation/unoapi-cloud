import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSenderReportWithSdes, buildWhatsappRtcpCname } from '../rtcp.js'

test('WhatsApp RTCP CNAME matches the MeowCaller byte shape', () => {
    const entropy = new Uint8Array([
        0, 1, 2, 3, 4, 5, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb
    ])
    assert.equal(Buffer.from(buildWhatsappRtcpCname(entropy)).toString(), '66778@pj899aab.org')
})

test('compound audio Sender Report and SDES match the MeowCaller layout', () => {
    const cname = new TextEncoder().encode('66778@pj899aab.org')
    const packet = buildSenderReportWithSdes(
        0x11112222,
        { packetsSent: 3, octetsSent: 400, rtpTimestamp: 90000 },
        1_700_000_000_000,
        cname
    )

    assert.equal(packet.length, 60)
    assert.equal(
        Buffer.from(packet).toString('hex'),
        '80c8000611112222e8fe6f800000000000015f900000000300000190' +
            '81ca0007111122220112363637373840706a3839396161622e6f726700000000'
    )
})
