import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { summarizeRelaySignaling } from '../relay-diagnostics.js'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

test('relay telemetry summarizes probes and candidates without exposing credentials', () => {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { id: 'SIGNALING' },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': 'CALL' },
                content: [
                    {
                        tag: 'te',
                        attrs: {
                            relay_name: 'fcgb9c01',
                            latency: String(0x2000000 + 37)
                        },
                        content: new Uint8Array([57, 144, 88, 57, 0x0d, 0x96])
                    },
                    {
                        tag: 'relay',
                        attrs: { uuid: 'UUID', self_pid: '4', peer_pid: '1' },
                        content: [
                            {
                                tag: 'participant',
                                attrs: { jid: '111:59@lid', pid: '4' }
                            },
                            { tag: 'key', attrs: {}, content: enc('SUPER_SECRET_RELAY_KEY') },
                            {
                                tag: 'token',
                                attrs: { id: '7' },
                                content: enc('SUPER_SECRET_TOKEN')
                            },
                            {
                                tag: 'auth_token',
                                attrs: { id: '9' },
                                content: enc('SUPER_SECRET_AUTH_TOKEN')
                            },
                            {
                                tag: 'te2',
                                attrs: {
                                    relay_name: 'bsb1c01',
                                    relay_id: '2',
                                    token_id: '7',
                                    auth_token_id: '9',
                                    protocol: '0',
                                    c2r_rtt: '41'
                                },
                                content: new Uint8Array([57, 144, 137, 57, 0x0d, 0x96])
                            }
                        ]
                    }
                ]
            }
        ]
    }

    const summary = summarizeRelaySignaling(node)

    assert.equal(summary.relayNodeCount, 1)
    assert.equal(summary.participantNodeCount, 1)
    assert.equal(summary.probeCount, 1)
    assert.deepEqual(summary.probes[0], {
        relayName: 'fcgb9c01',
        encodedLatency: 0x2000000 + 37,
        latency: 37,
        addressBytes: 6,
        addressFamily: 'ipv4',
        ip: '57.144.88.57',
        port: 3478,
        parseOutcome: 'parsed_ipv4'
    })
    assert.equal(summary.candidateNodeCount, 1)
    assert.deepEqual(summary.candidates[0], {
        relayName: 'bsb1c01',
        relayId: 2,
        tokenId: '7',
        authTokenId: '9',
        protocol: 0,
        c2rRtt: 41,
        isFna: false,
        tokenPresent: true,
        tokenBytes: enc('SUPER_SECRET_TOKEN').length,
        authTokenPresent: true,
        authTokenBytes: enc('SUPER_SECRET_AUTH_TOKEN').length,
        relayKeyPresent: true,
        relayKeyBytes: enc('SUPER_SECRET_RELAY_KEY').length,
        addressBytes: 6,
        addressFamily: 'ipv4',
        ip: '57.144.137.57',
        port: 3478,
        parseOutcome: 'parsed_ipv4'
    })

    const serialized = JSON.stringify(summary)
    assert.equal(serialized.includes('SUPER_SECRET_TOKEN'), false)
    assert.equal(serialized.includes('SUPER_SECRET_AUTH_TOKEN'), false)
    assert.equal(serialized.includes('SUPER_SECRET_RELAY_KEY'), false)
})

test('relay telemetry explains parsed IPv6 and every unsupported address shape', () => {
    const ipv6Address = new Uint8Array(18)
    ipv6Address[15] = 1
    ipv6Address[16] = 0x0d
    ipv6Address[17] = 0x96
    const node: BinaryNode = {
        tag: 'relay',
        attrs: {},
        content: [
            { tag: 'te2', attrs: { relay_name: 'missing' }, content: undefined },
            {
                tag: 'te2',
                attrs: { relay_name: 'short' },
                content: new Uint8Array([1, 2, 3])
            },
            { tag: 'te2', attrs: { relay_name: 'ipv6' }, content: ipv6Address },
            {
                tag: 'te2',
                attrs: { relay_name: 'unknown' },
                content: new Uint8Array(7)
            }
        ]
    }

    const summary = summarizeRelaySignaling(node)

    assert.deepEqual(
        summary.candidates.map((candidate) => ({
            relayName: candidate.relayName,
            addressBytes: candidate.addressBytes,
            addressFamily: candidate.addressFamily,
            parseOutcome: candidate.parseOutcome
        })),
        [
            {
                relayName: 'missing',
                addressBytes: 0,
                addressFamily: 'missing',
                parseOutcome: 'ignored_missing_address'
            },
            {
                relayName: 'short',
                addressBytes: 3,
                addressFamily: 'unsupported',
                parseOutcome: 'ignored_short_address'
            },
            {
                relayName: 'ipv6',
                addressBytes: 18,
                addressFamily: 'ipv6',
                parseOutcome: 'parsed_ipv6'
            },
            {
                relayName: 'unknown',
                addressBytes: 7,
                addressFamily: 'unsupported',
                parseOutcome: 'ignored_unsupported_address_length'
            }
        ]
    )
})
