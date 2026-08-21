import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallManager } from '../../call/WaCallManager.js'
import type { WaVoipDeps } from '../../types.js'
import { routeCallAck, routeCallReceipt, routeCallStanza } from '../bridge.js'

function mocks() {
    const sent: BinaryNode[] = []
    const dispatched: string[] = []
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({
                meLid: '1111:59@lid',
                meJid: '5511999999999:59@s.whatsapp.net'
            })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        }
    } as unknown as WaVoipDeps
    const manager = {
        handleCallOffer: async () => void dispatched.push('offer'),
        handleCallPreaccept: async () => void dispatched.push('preaccept'),
        handleCallAccept: async () => void dispatched.push('accept'),
        handleCallTransport: async () => void dispatched.push('transport'),
        handleCallTerminate: async () => void dispatched.push('terminate'),
        handleCallRelaylatency: async () => void dispatched.push('relaylatency'),
        handleCallAck: async () => void dispatched.push('ack'),
        handleCallMuteV2: async () => void dispatched.push('mute_v2'),
        handleCallReject: async () => void dispatched.push('reject'),
        handleRelayElection: () => void dispatched.push('relay_election')
    } as unknown as WaCallManager
    return { sent, dispatched, deps, manager }
}

function callNode(innerTag: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: '5511:0@lid', id: 'STANZA1' },
        content: [
            {
                tag: innerTag,
                attrs: { 'call-id': 'CID', 'call-creator': '5511:0@lid' },
                content: undefined
            }
        ]
    }
}

test('routeCallStanza sends the Zapo call receipt and dispatches the offer', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const tag = await routeCallStanza(manager, deps, callNode('offer'))

    assert.equal(tag, 'offer')
    assert.deepEqual(dispatched, ['offer'])
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'receipt')
    assert.equal(sent[0].attrs.id, 'STANZA1')
    assert.equal(sent[0].attrs.to, '5511:0@lid')
    assert.equal(sent[0].attrs.from, '1111:59@lid')
    assert.deepEqual(sent[0].content, [
        {
            tag: 'offer',
            attrs: { 'call-id': 'CID', 'call-creator': '5511:0@lid' }
        }
    ])
})

test('routeCallStanza logs a redacted inbound envelope without changing routing', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const debugEntries: Array<{
        message: string
        context?: Readonly<Record<string, unknown>>
    }> = []
    const logger = {
        level: 'debug',
        trace() {},
        debug(message: string, context?: Readonly<Record<string, unknown>>) {
            debugEntries.push({ message, context })
        },
        info() {},
        warn() {},
        error() {},
        child() {
            return this
        }
    }
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: '5511:0@lid', id: 'STANZA1' },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': 'CID',
                    'call-creator': '5511:0@lid',
                    secret: 'secret-attribute-value'
                },
                content: [
                    {
                        tag: 'enc',
                        attrs: { type: 'pkmsg', secret: 'secret-encryption-metadata' },
                        content: new Uint8Array([1, 2, 3, 4])
                    }
                ]
            }
        ]
    }

    await routeCallStanza(manager, deps, node, logger as never)

    assert.deepEqual(dispatched, ['offer'])
    assert.equal(sent.length, 1)
    const entry = debugEntries.find(
        (candidate) => candidate.message === 'voip_diag inbound_call_envelope'
    )
    assert.ok(entry?.context)
    assert.equal(entry.context.rawPeerJid, '5511:0@lid')
    assert.equal(entry.context.normalizedPeerJid, '5511@lid')
    assert.equal(entry.context.tag, 'offer')
    const serialized = JSON.stringify(entry.context)
    assert.equal(serialized.includes('secret-attribute-value'), false)
    assert.equal(serialized.includes('secret-encryption-metadata'), false)
    assert.equal(serialized.includes('"contentBytes":4'), true)
})

test('routeCallStanza sends exactly one receipt for accept', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    await routeCallStanza(manager, deps, callNode('accept'))

    assert.deepEqual(dispatched, ['accept'])
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'receipt')
    assert.equal((sent[0].content as BinaryNode[])[0].tag, 'accept')
})

test('routeCallStanza keeps plain call ack for preaccept', async () => {
    const { sent, deps, manager } = mocks()
    await routeCallStanza(manager, deps, callNode('preaccept'))

    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.equal(sent[0].attrs.class, 'call')
    assert.equal(sent[0].attrs.type, 'preaccept')
})

test('routeCallStanza routes each call tag to its handler', async () => {
    for (const tag of [
        'preaccept',
        'accept',
        'transport',
        'terminate',
        'relaylatency',
        'mute_v2',
        'reject',
        'relay_election'
    ]) {
        const { dispatched, deps, manager } = mocks()
        await routeCallStanza(manager, deps, callNode(tag))
        assert.deepEqual(dispatched, [tag])
    }
})

test('routeCallStanza handles inbound mute_v2 before acknowledging it', async () => {
    const { sent, deps, manager } = mocks()
    let sentBeforeMuteHandler = -1
    manager.handleCallMuteV2 = async () => {
        sentBeforeMuteHandler = sent.length
    }

    await routeCallStanza(manager, deps, callNode('mute_v2'))

    assert.equal(sentBeforeMuteHandler, 0)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.equal(sent[0].attrs.class, 'call')
    assert.equal(sent[0].attrs.type, 'mute_v2')
})

test('routeCallStanza ignores a call node with no inner child', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const tag = await routeCallStanza(manager, deps, {
        tag: 'call',
        attrs: { from: 'x@lid' },
        content: undefined
    })
    assert.equal(tag, null)
    assert.equal(sent.length, 0)
    assert.deepEqual(dispatched, [])
})

test('routeCallStanza acks but skips routing when the peer jid is malformed', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: '5:x@lid', id: 'STANZA2' },
        content: [{ tag: 'offer', attrs: {}, content: undefined }]
    }
    const tag = await routeCallStanza(manager, deps, node)

    assert.equal(tag, 'offer')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.deepEqual(dispatched, [])
})

test('routeCallReceipt acks receipt-class call tags and skips others', async () => {
    const receipt = (innerTag: string): BinaryNode => ({
        tag: 'receipt',
        attrs: { from: '5511:0@lid', id: 'R1', type: 'delivery' },
        content: [{ tag: innerTag, attrs: {}, content: undefined }]
    })

    const handled = mocks()
    assert.equal(await routeCallReceipt(handled.deps, receipt('offer')), true)
    assert.equal(handled.sent.length, 1)
    assert.equal(handled.sent[0].attrs.class, 'receipt')
    assert.equal(handled.sent[0].attrs.type, 'delivery')
    assert.equal(handled.sent[0].attrs.to, '5511:0@lid')
    assert.equal(handled.sent[0].attrs.id, 'R1')

    const skipped = mocks()
    assert.equal(await routeCallReceipt(skipped.deps, receipt('message')), false)
    assert.equal(skipped.sent.length, 0)
})

test('routeCallAck logs a redacted envelope and preserves manager dispatch', async () => {
    const { dispatched, manager } = mocks()
    const entries: Array<{ message: string; context?: Readonly<Record<string, unknown>> }> = []
    const logger = {
        level: 'debug',
        trace() {},
        debug(message: string, context?: Readonly<Record<string, unknown>>) {
            entries.push({ message, context })
        },
        info() {},
        warn() {},
        error() {},
        child() {
            return this
        }
    }
    const node: BinaryNode = {
        tag: 'ack',
        attrs: {
            class: 'call',
            type: 'relaylatency',
            id: 'OUTBOUND-RELAYLATENCY-1',
            from: '5511:0@lid',
            error: '0',
            secret: 'must-not-be-logged'
        },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': 'CID', secret: 'nested-secret' },
                content: new Uint8Array([1, 2, 3])
            }
        ]
    }

    await routeCallAck(manager, node, logger as never)

    assert.deepEqual(dispatched, ['ack'])
    const entry = entries.find(
        (candidate) => candidate.message === 'voip_diag inbound_call_ack_envelope'
    )
    assert.equal(entry?.context?.stanzaId, 'OUTBOUND-RELAYLATENCY-1')
    assert.equal(entry?.context?.type, 'relaylatency')
    assert.equal(entry?.context?.error, '0')
    const serialized = JSON.stringify(entry?.context)
    assert.equal(serialized.includes('must-not-be-logged'), false)
    assert.equal(serialized.includes('nested-secret'), false)
    assert.equal(serialized.includes('"contentBytes":3'), true)
})

test('routeCallReceipt logs the handled call receipt without changing its ack', async () => {
    const handled = mocks()
    const entries: Array<{ message: string; context?: Readonly<Record<string, unknown>> }> = []
    const logger = {
        level: 'debug',
        trace() {},
        debug(message: string, context?: Readonly<Record<string, unknown>>) {
            entries.push({ message, context })
        },
        info() {},
        warn() {},
        error() {},
        child() {
            return this
        }
    }
    const receipt: BinaryNode = {
        tag: 'receipt',
        attrs: { from: '5511:0@lid', id: 'RECEIPT-1', type: 'delivery' },
        content: [{ tag: 'relaylatency', attrs: { 'call-id': 'CID' } }]
    }

    assert.equal(await routeCallReceipt(handled.deps, receipt, logger as never), true)
    assert.equal(handled.sent.length, 1)
    assert.equal(handled.sent[0].attrs.id, 'RECEIPT-1')
    const entry = entries.find(
        (candidate) => candidate.message === 'voip_diag inbound_call_receipt_envelope'
    )
    assert.equal(entry?.context?.stanzaId, 'RECEIPT-1')
    assert.equal(entry?.context?.innerTag, 'relaylatency')
})
