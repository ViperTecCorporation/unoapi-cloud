import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallManager } from '../../call/WaCallManager.js'
import type { WaVoipDeps } from '../../types.js'
import { routeCallReceipt, routeCallStanza } from '../bridge.js'

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
