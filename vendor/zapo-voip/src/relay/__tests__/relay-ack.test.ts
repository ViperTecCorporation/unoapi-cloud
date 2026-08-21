import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { parseRelayFromAck } from '../relay-ack.js'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

function buildRelayAck(): BinaryNode {
    const tokenBytes = new Uint8Array([0xaa, 0xbb, 0xcc])
    const authTokenBytes = new Uint8Array([0x11, 0x22])
    const hbhKey = new Uint8Array(30).fill(7)
    const te2Addr = new Uint8Array([192, 168, 1, 1, 0x0d, 0x96])

    return {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'user',
                attrs: {},
                content: [
                    { tag: 'device', attrs: { jid: '111@lid' }, content: undefined },
                    { tag: 'device', attrs: { jid: '222@lid' }, content: undefined }
                ]
            },
            {
                tag: 'relay',
                attrs: { uuid: 'UUID-1', self_pid: '5', peer_pid: '7' },
                content: [
                    { tag: 'participant', attrs: { jid: '333:12@lid', pid: '7' }, content: undefined },
                    { tag: 'participant', attrs: { jid: '111:59@lid', pid: '5' }, content: undefined },
                    { tag: 'key', attrs: {}, content: enc('RELAYKEY') },
                    { tag: 'hbh_key', attrs: {}, content: hbhKey },
                    { tag: 'token', attrs: { id: '1' }, content: tokenBytes },
                    { tag: 'auth_token', attrs: { id: '9' }, content: authTokenBytes },
                    {
                        tag: 'te2',
                        attrs: {
                            token_id: '1',
                            auth_token_id: '9',
                            relay_name: 'r1',
                            protocol: '1',
                            relay_id: '2',
                            c2r_rtt: '40'
                        },
                        content: te2Addr
                    }
                ]
            }
        ]
    }
}

test('parseRelayFromAck extracts relay metadata, participants and hbh key', () => {
    const result = parseRelayFromAck(buildRelayAck())

    assert.equal(result.uuid, 'UUID-1')
    assert.equal(result.selfPid, 5)
    assert.equal(result.peerPid, 7)
    assert.deepEqual([...(result.hbhKey ?? [])], new Array(30).fill(7))

    assert.deepEqual(result.participantJids, ['111@lid', '222@lid', '333:12@lid', '111:59@lid'])
    assert.equal(result.selfParticipantJid, '111:59@lid')
    assert.equal(result.peerParticipantJid, '333:12@lid')

    assert.equal(result.relays.length, 1)
    const relay = result.relays[0]
    assert.equal(relay.ip, '192.168.1.1')
    assert.equal(relay.port, 3478)
    assert.equal(relay.addressFamily, 4)
    assert.equal(relay.key, 'RELAYKEY')
    assert.equal(relay.relayId, 2)
    assert.equal(relay.protocol, 1)
    assert.equal(relay.c2rRtt, 40)
    assert.equal(relay.relayName, 'r1')
    assert.equal(relay.tokenId, '1')
    assert.equal(relay.authTokenId, '9')
    assert.deepEqual([...(relay.rawToken ?? [])], [0xaa, 0xbb, 0xcc])
    assert.deepEqual([...(relay.rawAuthToken ?? [])], [0x11, 0x22])
    assert.deepEqual([...(relay.addressBytes ?? [])], [192, 168, 1, 1, 0x0d, 0x96])
})

test('parseRelayFromAck finds a relay nested in call signaling', () => {
    const relayAck = buildRelayAck()
    const nested: BinaryNode = {
        tag: 'call',
        attrs: { from: '333:12@lid', id: 'RELAY-PATCH' },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': 'CALL-1', 'call-creator': '333:12@lid' },
                content: relayAck.content
            }
        ]
    }

    const result = parseRelayFromAck(nested)
    assert.equal(result.relays.length, 1)
    assert.equal(result.relays[0].relayName, 'r1')
    assert.equal(result.peerParticipantJid, '333:12@lid')
    assert.deepEqual(result.participantJids, [
        '111@lid',
        '222@lid',
        '333:12@lid',
        '111:59@lid'
    ])
})

test('parseRelayFromAck skips te2 entries with a short address', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'te2', attrs: { relay_name: 'r' }, content: new Uint8Array([1, 2, 3]) }
                ]
            }
        ]
    }

    assert.deepEqual(parseRelayFromAck(ack).relays, [])
})

test('parseRelayFromAck preserves parallel IPv4 and IPv6 candidates', () => {
    const ack = buildRelayAck()
    const relay = (ack.content as BinaryNode[]).find((child) => child.tag === 'relay')
    assert.ok(relay && Array.isArray(relay.content))
    relay.content.push({
        tag: 'te2',
        attrs: {
            token_id: '1',
            auth_token_id: '9',
            relay_name: 'r1',
            protocol: '1',
            relay_id: '2'
        },
        content: new Uint8Array([
            0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x0d, 0x96
        ])
    })

    const result = parseRelayFromAck(ack)
    assert.deepEqual(
        result.relays.map(({ ip, port, addressFamily, relayId }) => ({
            ip,
            port,
            addressFamily,
            relayId
        })),
        [
            { ip: '192.168.1.1', port: 3478, addressFamily: 4, relayId: 2 },
            { ip: '2001:db8:0:0:0:0:0:1', port: 3478, addressFamily: 6, relayId: 2 }
        ]
    )
})

test('parseRelayFromAck returns an empty result for a childless ack', () => {
    const result = parseRelayFromAck({ tag: 'ack', attrs: {}, content: undefined })
    assert.deepEqual(result.relays, [])
    assert.deepEqual(result.participantJids, [])
    assert.equal(result.uuid, '')
    assert.equal(result.hbhKey, undefined)
})

test('parseRelayFromAck preserves te2 wire order for relay selection', () => {
    const fnaAddr = new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
    const edgeAddr = new Uint8Array([192, 168, 1, 1, 0x0d, 0x96])

    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'U' },
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([1]) },
                    {
                        tag: 'te2',
                        attrs: {
                            token_id: '0',
                            relay_name: 'alpha',
                            relay_id: '0',
                            c2r_rtt: '18',
                            is_fna: '1'
                        },
                        content: fnaAddr
                    },
                    {
                        tag: 'te2',
                        attrs: { token_id: '0', relay_name: 'zulu', relay_id: '1', c2r_rtt: '40' },
                        content: edgeAddr
                    }
                ]
            }
        ]
    }

    const { relays } = parseRelayFromAck(ack)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].relayName, 'alpha')
    assert.equal(relays[0].isFna, true)
    assert.equal(relays[1].relayName, 'zulu')
    assert.equal(relays[1].isFna, false)
})

test('token_id is not misreported as auth_token_id', () => {
    const ack: BinaryNode = {
        tag: 'ack',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: {},
                content: [
                    { tag: 'key', attrs: {}, content: enc('K') },
                    { tag: 'token', attrs: { id: '7' }, content: 'TOKEN' },
                    {
                        tag: 'te2',
                        attrs: { token_id: '7', relay_name: 'without-auth' },
                        content: new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])
                    }
                ]
            }
        ]
    }

    const relay = parseRelayFromAck(ack).relays[0]
    assert.equal(relay.authTokenId, undefined)
    assert.deepEqual([...(relay.rawToken ?? [])], [...enc('TOKEN')])
})
