import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, EndCallReason, type WaVoipDeps } from '../../types.js'
import {
    buildAcceptStanza,
    buildDirectAcceptStanza,
    buildIncomingPreacceptStanza,
    buildOutgoingPreacceptStanza,
    buildRejectStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    extractNodeInfo,
    extractRelayEndpoints,
    generateCallId,
    generateCallStanzaId,
    needsDecryption
} from '../signaling.js'

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('buildTerminateStanza targets the peer device JID with a terminate payload', () => {
    const node = buildTerminateStanza('12345:7@s.whatsapp.net', 'CALLID', '12345@s.whatsapp.net')
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345:7@s.whatsapp.net')
    const inner = (
        node.content as unknown as Array<{ tag: string; attrs: Record<string, string> }>
    )[0]
    assert.equal(inner.tag, 'terminate')
    assert.equal(inner.attrs['call-id'], 'CALLID')
})

test('buildRejectStanza preserves the exact peer device JID', () => {
    const node = buildRejectStanza('12345:7@lid', 'CALLID', '12345@lid')
    const inner = (node.content as unknown as Array<{ tag: string }>)[0]
    assert.equal(node.attrs.to, '12345:7@lid')
    assert.equal(inner.tag, 'reject')
})

test('needsDecryption only flags encrypted payload tags', () => {
    assert.equal(needsDecryption('accept'), true)
    assert.equal(needsDecryption('preaccept'), true)
    assert.equal(needsDecryption('offer'), false)
    assert.equal(needsDecryption('terminate'), false)
})

test('buildAcceptStanza preserves the official encrypted Zapo inbound answer shape', async () => {
    let syncedJid = ''
    let encrypted = false
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: 'self@lid',
                meLid: 'self@lid',
                signedIdentity: undefined
            })
        },
        messageDispatch: {
            syncSignalSession: async (jid: string) => {
                syncedJid = jid
            }
        },
        signalProtocol: {
            encryptMessage: async () => {
                encrypted = true
                return { type: 'msg' as const, ciphertext: new Uint8Array([4, 5, 6]) }
            }
        }
    } as unknown as WaVoipDeps
    const callKey = new Uint8Array(32).fill(7)

    const node = await buildAcceptStanza(
        deps,
        'CID',
        callKey,
        'peer:7@lid',
        'creator:0@lid',
        false
    )
    const accept = (node.content as BinaryNode[])[0]
    const children = accept.content as BinaryNode[]

    assert.equal(syncedJid, 'creator:0@lid')
    assert.equal(encrypted, true)
    assert.equal(node.attrs.to, 'peer@lid')
    assert.deepEqual(children.map((child) => child.tag), ['audio', 'net', 'enc', 'encopt'])
    assert.equal(children[1].attrs.medium, '3')
    assert.equal(children[2].attrs.type, 'msg')
    assert.deepEqual(children[2].content, new Uint8Array([4, 5, 6]))
})

test('buildDirectAcceptStanza matches the MeowCaller 1:1 callee answer shape', () => {
    const node = buildDirectAcceptStanza(
        'CID',
        'peer:7@lid',
        'creator:0@lid',
        false
    )
    const accept = (node.content as BinaryNode[])[0]
    const children = accept.content as BinaryNode[]

    assert.equal(node.attrs.to, 'peer:7@lid')
    assert.deepEqual(
        children.map((child) => child.tag),
        ['audio', 'net', 'encopt', 'metadata']
    )
    assert.equal(children[0].attrs.rate, '16000')
    assert.equal(children[1].attrs.medium, '2')
    assert.equal(children[2].attrs.keygen, '2')
    assert.equal(children[3].attrs.peer_abtest_bucket_id_list, '125208,94276')
})

test('direct accept and preaccept advertise only 8 kHz for the Opus fallback', () => {
    const accept = buildDirectAcceptStanza(
        'CID-OPUS',
        'peer:28@lid',
        'peer:0@lid',
        false,
        '8000'
    )
    const preaccept = buildIncomingPreacceptStanza(
        'peer:28@lid',
        'CID-OPUS',
        'peer:0@lid',
        '8000'
    )

    const acceptAudio = ((accept.content as BinaryNode[])[0].content as BinaryNode[])[0]
    const preacceptAudio = ((preaccept.content as BinaryNode[])[0].content as BinaryNode[])[0]
    assert.deepEqual(acceptAudio.attrs, { enc: 'opus', rate: '8000' })
    assert.deepEqual(preacceptAudio.attrs, { enc: 'opus', rate: '8000' })
})

test('incoming preaccept uses the MeowCaller callee capability', () => {
    const node = buildIncomingPreacceptStanza('peer:28@lid', 'CID', 'peer:0@lid')
    const preaccept = (node.content as BinaryNode[])[0]
    const capability = (preaccept.content as BinaryNode[]).find(
        (child) => child.tag === 'capability'
    )

    assert.equal(node.attrs.to, 'peer:28@lid')
    assert.deepEqual(
        capability?.content,
        new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xbb, 0x07])
    )
})

test('outgoing caller preaccept preserves the proven ViperConnect capability', () => {
    const node = buildOutgoingPreacceptStanza('peer@lid', 'CID', 'self:59@lid')
    const preaccept = (node.content as BinaryNode[])[0]
    const capability = (preaccept.content as BinaryNode[]).find(
        (child) => child.tag === 'capability'
    )

    assert.deepEqual(
        capability?.content,
        new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07])
    )
})

test('enums expose the documented call states', () => {
    assert.equal(CallState.Active, 'active')
    assert.equal(EndCallReason.UserEnded, 'user_ended')
})

test('buildTerminateStanza includes reason and duration attributes', () => {
    const node = buildTerminateStanza('p:0@lid', 'CID', 'creator@lid', 1500, 'accepted_elsewhere')
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.attrs.reason, 'accepted_elsewhere')
    assert.equal(inner.attrs.duration, '1500')
    assert.equal(inner.attrs.audio_duration, '1500')
})

test('buildRelayLatencyStanza preserves the exact device and can omit destination', () => {
    const address = new Uint8Array([1, 2, 3, 4, 0x0d, 0x96])
    const node = buildRelayLatencyStanza(
        '12345:7@s.whatsapp.net',
        'CID',
        'creator@lid',
        [{ relayName: 'gru2c01', latency: 42, addressBytes: address }],
        []
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345:7@s.whatsapp.net')

    const relaylatency = (node.content as BinaryNode[])[0]
    assert.equal(relaylatency.tag, 'relaylatency')
    assert.equal(relaylatency.attrs['call-id'], 'CID')

    const children = relaylatency.content as BinaryNode[]
    assert.equal(children[0].tag, 'te')
    assert.equal(children[0].attrs.latency, String(0x02000000 + 42))
    assert.equal(children[0].attrs.relay_name, 'gru2c01')
    assert.deepEqual(children[0].content, address)
    assert.equal(children.some((child) => child.tag === 'destination'), false)
})

test('extractNodeInfo reads the inner call tag and ids', () => {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer:0@lid', platform: 'web', version: '2.3' },
        content: [{ tag: 'offer', attrs: { 'call-id': 'CID' }, content: undefined }]
    }
    const info = extractNodeInfo(node)
    assert.ok(info)
    assert.equal(info.tag, 'offer')
    assert.equal(info.callId, 'CID')
    assert.equal(info.peerJid, 'peer:0@lid')
    assert.equal(info.peerPlatform, 'web')
})

test('extractNodeInfo returns null when there is no inner node', () => {
    assert.equal(extractNodeInfo({ tag: 'call', attrs: {}, content: undefined }), null)
})

test('extractRelayEndpoints collects direct and wrapped relays sorted by rtt', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { ip: '1.1.1.1', port: '3480', token: 't1', 'c2r-rtt': '50' },
                content: undefined
            },
            {
                tag: 'relays',
                attrs: {},
                content: [
                    {
                        tag: 'relay',
                        attrs: { ip: '2.2.2.2', port: '3481', token: 't2', 'c2r-rtt': '10' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const relays = extractRelayEndpoints(node)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].ip, '2.2.2.2')
    assert.equal(relays[0].port, 3481)
    assert.equal(relays[1].ip, '1.1.1.1')
})

test('extractRelayEndpoints drops relays missing ip or token', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            { tag: 'relay', attrs: { ip: '1.1.1.1' }, content: undefined },
            { tag: 'relay', attrs: { token: 'only-token' }, content: undefined }
        ]
    }
    assert.deepEqual(extractRelayEndpoints(node), [])
})
