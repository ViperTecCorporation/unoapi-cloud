import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { summarizeCallEnvelope } from '../signaling-diagnostics.js'

test('call envelope diagnostics preserve routing shape and redact credentials', () => {
    const node: BinaryNode = {
        tag: 'call',
        attrs: {
            from: '5511:27@lid',
            to: '5522:59@lid',
            id: 'STANZA-ID',
            secret_outer: 'must-not-leak'
        },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': 'CALL-ID',
                    'call-creator': '5511:27@lid',
                    secret_inner: 'must-not-leak'
                },
                content: [
                    {
                        tag: 'relay',
                        attrs: { token: 'secret-token', key: 'secret-key' },
                        content: [
                            {
                                tag: 'te2',
                                attrs: {
                                    relay_name: 'bsb1c01',
                                    relay_id: '0',
                                    token_id: '1',
                                    auth_token_id: '2',
                                    token: 'secret-token'
                                },
                                content: new Uint8Array([1, 2, 3, 4, 5, 6])
                            },
                            {
                                tag: 'token',
                                attrs: { id: '1' },
                                content: new Uint8Array([9, 8, 7])
                            }
                        ]
                    },
                    {
                        tag: 'enc',
                        attrs: { type: 'pkmsg', v: '2', secret: 'hidden' },
                        content: new Uint8Array([10, 11, 12, 13])
                    }
                ]
            }
        ]
    }

    const summary = summarizeCallEnvelope(node)
    const serialized = JSON.stringify(summary)

    assert.equal(summary.attrs.from, '5511:27@lid')
    assert.equal(summary.attrs.to, '5522:59@lid')
    assert.equal(summary.children?.[0]?.attrs['call-id'], 'CALL-ID')
    assert.deepEqual(summary.children?.[0]?.children?.map((child) => child.tag), [
        'relay',
        'enc'
    ])
    assert.equal(
        summary.children?.[0]?.children?.[0]?.children?.[0]?.contentBytes,
        6
    )
    assert.equal(summary.children?.[0]?.children?.[1]?.contentBytes, 4)
    assert.equal(serialized.includes('secret-token'), false)
    assert.equal(serialized.includes('secret-key'), false)
    assert.equal(serialized.includes('must-not-leak'), false)
    assert.equal(serialized.includes('hidden'), false)
    assert.equal(serialized.includes('"token"'), true)
})

test('call envelope diagnostics never copy text payload content', () => {
    const summary = summarizeCallEnvelope({
        tag: 'token',
        attrs: { id: '4' },
        content: 'sensitive-text-token'
    })

    assert.equal(summary.contentKind, 'text')
    assert.equal(summary.contentBytes, 20)
    assert.equal(JSON.stringify(summary).includes('sensitive-text-token'), false)
})
