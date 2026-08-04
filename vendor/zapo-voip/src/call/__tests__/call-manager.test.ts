import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, type WaVoipDeps, type WaVoipStores } from '../../types.js'
import { type CallInfo } from '../call-state.js'
import { WaCallManager } from '../WaCallManager.js'

function createMockDeps(): { deps: WaVoipDeps; stores: WaVoipStores; sent: BinaryNode[] } {
    const sent: BinaryNode[] = []
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '1111111111@lid',
                meLid: '1111111111@lid',
                signedIdentity: undefined
            })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            },
            query: async () => undefined
        },
        signalProtocol: {
            encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) }),
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) })),
            decryptMessage: async () => new Uint8Array([1, 2, 3])
        },
        signalDeviceSync: {
            syncDeviceList: async (jids: readonly string[]) => [
                {
                    jid: jids[0],
                    deviceJids: [jids[0].replace(/@lid$/, ':0@lid')]
                }
            ],
            queryLidsByPhoneJids: async () => []
        },
        presenceCoordinator: {
            subscribe: async () => undefined
        },
        messageDispatch: {
            syncSignalSession: async () => undefined
        },
        sessionResolver: {
            ensureSessionsBatch: async () => []
        }
    } as unknown as WaVoipDeps
    const stores = {
        privacyToken: { getByJid: async () => undefined }
    } as unknown as WaVoipStores

    return { deps, stores, sent }
}

function buildOfferNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': callId,
                    'call-creator': from
                },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined }
                ]
            }
        ]
    }
}

function buildTerminateNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'TERMINATEMSGID' },
        content: [
            {
                tag: 'terminate',
                attrs: {
                    'call-id': callId,
                    'call-creator': from
                }
            }
        ]
    }
}

function buildMuteNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'MUTEMSGID' },
        content: [
            {
                tag: 'mute_v2',
                attrs: {
                    'call-id': callId,
                    'call-creator': from,
                    'mute-state': '0'
                }
            }
        ]
    }
}

function buildAcceptNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'ACCEPTMSGID' },
        content: [
            {
                tag: 'accept',
                attrs: {
                    'call-id': callId,
                    'call-creator': '1111111111@lid'
                }
            }
        ]
    }
}

function buildRejectNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'REJECTMSGID' },
        content: [
            {
                tag: 'reject',
                attrs: {
                    'call-id': callId,
                    'call-creator': '1111111111@lid'
                }
            }
        ]
    }
}

test('WaCallManager rejects invalid maxConcurrentCalls', () => {
    const { deps, stores } = createMockDeps()
    assert.throws(
        () => new WaCallManager({ deps, stores, maxConcurrentCalls: 0 }),
        /maxConcurrentCalls must be a positive safe integer/
    )
})

test('already-ended offer notification is ignored without preaccepting it', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const node = buildOfferNode('ENDED-CALL')
    const offer = (node.content as BinaryNode[])[0]
    const attrs = offer.attrs as Record<string, string>
    attrs.is_call_ended = '1'
    attrs.terminate_reason = 'accepted_elsewhere'

    await manager.handleCallOffer(node, '2222222222:0@lid')

    assert.equal(manager.getCall('ENDED-CALL'), null)
    assert.equal(sent.length, 0)
})

test('startCall blocks when maxConcurrentCalls is reached', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    await manager.startCall({ peerJid: '2222222222@lid' })

    await assert.rejects(
        () => manager.startCall({ peerJid: '3333333333@lid' }),
        /max concurrent calls reached \(1\)/
    )
})

test('startCall allows parallel calls when maxConcurrentCalls > 1', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    const callIdA = await manager.startCall({ peerJid: '2222222222@lid' })
    const callIdB = await manager.startCall({ peerJid: '3333333333@lid' })

    assert.notEqual(callIdA, callIdB)
    assert.equal(manager.getCalls().length, 2)
})

test('startCall uses an inline enc for one explicit peer device', async () => {
    const { deps, stores, sent } = createMockDeps()
    let syncCalls = 0
    deps.signalDeviceSync.syncDeviceList = async () => {
        syncCalls++
        return [{ jid: '2222222222@lid', deviceJids: ['2222222222:99@lid'] }]
    }
    const manager = new WaCallManager({ deps, stores })

    await manager.startCall({
        peerJid: '2222222222@lid',
        peerDevices: ['2222222222:7@lid', '2222222222:7@lid']
    })

    assert.equal(syncCalls, 0)
    const offer = (sent[0].content as BinaryNode[])[0]
    const destination = (offer.content as BinaryNode[]).find((node) => node.tag === 'destination')
    const inlineEnc = (offer.content as BinaryNode[]).find((node) => node.tag === 'enc')
    assert.equal(destination, undefined)
    assert.ok(inlineEnc)
})

test('startCall prepares PN and resolved LID presence before a single-device inline offer', async () => {
    const { deps, stores, sent } = createMockDeps()
    const subscribed: string[] = []
    deps.signalDeviceSync.queryLidsByPhoneJids = async () => [
        { lidJid: '2222222222@lid' }
    ] as any
    ;(deps.presenceCoordinator as any).subscribe = async (jid: string) => {
        subscribed.push(jid)
    }
    deps.signalDeviceSync.syncDeviceList = async () => [
        { jid: '2222222222@lid', deviceJids: ['2222222222:28@lid'] }
    ]
    const manager = new WaCallManager({ deps, stores })

    await manager.startCall({ peerJid: '5511999999999@s.whatsapp.net' })

    assert.deepEqual(subscribed, ['5511999999999@s.whatsapp.net', '2222222222@lid'])
    const offer = (sent[0].content as BinaryNode[])[0]
    const destination = (offer.content as BinaryNode[]).find((node) => node.tag === 'destination')
    const inlineEnc = (offer.content as BinaryNode[]).find((node) => node.tag === 'enc')
    assert.equal(destination, undefined)
    assert.ok(inlineEnc)
})

test('startCall keeps destination routing for multiple peer devices', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })

    await manager.startCall({
        peerJid: '2222222222@lid',
        peerDevices: ['2222222222:7@lid', '2222222222:8@lid']
    })

    const offer = (sent[0].content as BinaryNode[])[0]
    const destination = (offer.content as BinaryNode[]).find((node) => node.tag === 'destination')
    const inlineEnc = (offer.content as BinaryNode[]).find((node) => node.tag === 'enc')
    assert.ok(destination)
    assert.equal(inlineEnc, undefined)
    assert.deepEqual(
        (destination.content as BinaryNode[]).map((node) => node.attrs.jid),
        ['2222222222:7@lid', '2222222222:8@lid']
    )
})

test('startCall rejects explicit peerDevices from another account', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })

    await assert.rejects(
        () =>
            manager.startCall({
                peerJid: '2222222222@lid',
                peerDevices: ['3333333333:7@lid']
            }),
        /no explicit peer devices match/
    )
})

test('outgoing preaccept and accept do not emit synthetic transport or mute_v2', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const peer = '2222222222:0@lid'
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })

    sent.length = 0
    await manager.handleCallPreaccept(
        {
            tag: 'call',
            attrs: { from: peer, id: 'PREACCEPTMSGID' },
            content: [
                {
                    tag: 'preaccept',
                    attrs: { 'call-id': callId, 'call-creator': '1111111111@lid' }
                }
            ]
        },
        peer
    )
    await manager.handleCallAccept(buildAcceptNode(callId, peer), peer)

    const actionTags = sent.flatMap((node) =>
        Array.isArray(node.content)
            ? node.content
                  .filter(
                      (child): child is BinaryNode =>
                          typeof child === 'object' && child !== null && 'tag' in child
                  )
                  .map((child) => child.tag)
            : []
    )
    assert.equal(actionTags.includes('transport'), false)
    assert.equal(actionTags.includes('mute_v2'), false)
})

test('outgoing accept does not terminate the answering device when relay uses bare device zero', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const session = (manager as any).calls.get(callId)
    session.info.relayData = {
        endpoints: [],
        participantJids: ['2222222222@lid'],
        peerParticipantJid: '2222222222@lid',
        uuid: ''
    }

    sent.length = 0
    await manager.handleCallAccept(buildAcceptNode(callId, '2222222222:0@lid'), '2222222222:0@lid')

    const actionTags = sent.flatMap((node) =>
        Array.isArray(node.content)
            ? node.content
                  .filter(
                      (child): child is BinaryNode =>
                          typeof child === 'object' && child !== null && 'tag' in child
                  )
                  .map((child) => child.tag)
            : []
    )
    assert.equal(actionTags.includes('terminate'), false)
})

test('offer ACK is routed by relay call-id after the call is already active', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const peer = '2222222222:0@lid'
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })

    await manager.handleCallAccept(buildAcceptNode(callId, peer), peer)
    assert.equal(manager.getCall(callId)?.stateData.state, CallState.Connecting)

    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer' },
        content: [{ tag: 'relay', attrs: { 'call-id': callId }, content: [] }]
    })

    assert.ok(manager.getCall(callId))
})

test('outgoing offer ACK does not send caller-side preaccept', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })

    sent.length = 0
    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer' },
        content: [{ tag: 'relay', attrs: { 'call-id': callId }, content: [] }]
    })

    assert.equal(
        sent.some((node) => (node.content as BinaryNode[])?.[0]?.tag === 'preaccept'),
        false
    )
})

test('remote reject ends and removes the outgoing call', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    let ended: CallInfo | undefined
    manager.on('call_ended', (call) => { ended = call })

    await manager.handleCallReject(buildRejectNode(callId))

    assert.equal(manager.getCall(callId), null)
    assert.equal(ended?.stateData.state, CallState.Ended)
    assert.equal(ended?.stateData.endReason, 'declined')
})

test('server offer ACK error ends and removes the routed call', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    let ended: CallInfo | undefined
    manager.on('call_ended', (call) => { ended = call })

    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', error: '439' },
        content: [{ tag: 'error', attrs: { 'call-id': callId }, content: undefined }]
    })

    assert.equal(manager.getCall(callId), null)
    assert.equal(ended?.stateData.state, CallState.Ended)
    assert.equal(ended?.stateData.endReason, 'failed')
})

test('incoming offer at capacity is tracked with canAccept false', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    await manager.startCall({ peerJid: '2222222222@lid' })
    const before = sent.length

    const incomingCallId = 'INCOMINGCALL0000000000000001'
    await manager.handleCallOffer(buildOfferNode(incomingCallId), '2222222222:0@lid')

    assert.equal(manager.getCalls().length, 2)
    const incoming = manager.getCall(incomingCallId)
    assert.ok(incoming)
    assert.equal(incoming.canAccept, false)
    assert.equal(incoming.isAcceptBlocked, true)

    const rejectNode = sent.slice(before).find((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return inner && typeof inner === 'object' && 'tag' in inner && inner.tag === 'reject'
    })
    assert.equal(rejectNode, undefined)

    const preacceptNode = sent.slice(before).find((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return inner && typeof inner === 'object' && 'tag' in inner && inner.tag === 'preaccept'
    })
    assert.equal(preacceptNode, undefined)

    await assert.rejects(() => manager.acceptCall(incomingCallId), /cannot be accepted/)
})

test('waiting incoming call unblocks when a slot frees', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const activeCallId = await manager.startCall({ peerJid: '2222222222@lid' })
    const incomingCallId = 'INCOMINGCALL0000000000000003'

    await manager.handleCallOffer(buildOfferNode(incomingCallId), '3333333333:0@lid')
    assert.equal(manager.getCall(incomingCallId)!.canAccept, false)

    const beforeEnd = sent.length
    await manager.endCall(activeCallId)

    const incoming = manager.getCall(incomingCallId)
    assert.ok(incoming)
    assert.equal(incoming.canAccept, true)
    assert.equal(incoming.isAcceptBlocked, false)

    const preacceptNode = sent.slice(beforeEnd).find((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return inner && typeof inner === 'object' && 'tag' in inner && inner.tag === 'preaccept'
    })
    assert.ok(preacceptNode, 'expected preaccept after slot freed')
})

test('incoming offer with capacity creates a second session', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    await manager.startCall({ peerJid: '2222222222@lid' })

    await manager.handleCallOffer(
        buildOfferNode('INCOMINGCALL0000000000000002'),
        '3333333333:0@lid'
    )

    assert.equal(manager.getCalls().length, 2)
})

test('incoming answer defers accept until the caller mute_v2 arrives', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const callId = 'INCOMINGCALL0000000000000004'
    const peer = '2222222222:0@lid'

    await manager.handleCallOffer(buildOfferNode(callId, peer), peer)
    const beforeAnswer = sent.length
    await manager.acceptCall(callId)

    const answerNodes = sent.slice(beforeAnswer)
    assert.equal(
        answerNodes.some((node) => (node.content as BinaryNode[])?.[0]?.tag === 'accept'),
        false
    )

    await manager.handleCallMuteV2(buildMuteNode(callId, peer), peer)
    const accept = sent.find((node) => (node.content as BinaryNode[])?.[0]?.tag === 'accept')
    assert.ok(accept)
    assert.equal(accept.attrs.to, peer)
})

test('incoming relaylatency answers each probe to the exact sender without destination', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores })
    const callId = 'INCOMINGCALL0000000000000005'
    const peer = '2222222222:28@lid'

    await manager.handleCallOffer(buildOfferNode(callId, peer), peer)
    sent.length = 0
    await manager.handleCallRelaylatency(
        {
            tag: 'call',
            attrs: { from: peer, id: 'RELAYLATENCYMSGID' },
            content: [
                {
                    tag: 'relaylatency',
                    attrs: { 'call-id': callId, 'call-creator': peer },
                    content: [
                        { tag: 'te', attrs: { latency: String(0x02000000 + 18), relay_name: 'gru2c01' }, content: new Uint8Array([1, 2, 3, 4, 0x0d, 0x96]) },
                        { tag: 'te', attrs: { latency: String(0x02000000 + 27), relay_name: 'gru2c02' }, content: new Uint8Array([5, 6, 7, 8, 0x0d, 0x96]) }
                    ]
                }
            ]
        },
        peer
    )

    assert.equal(sent.length, 2)
    for (const [index, response] of sent.entries()) {
        assert.equal(response.attrs.to, peer)
        const action = (response.content as BinaryNode[])[0]
        const children = action.content as BinaryNode[]
        assert.equal(action.tag, 'relaylatency')
        assert.equal(children.length, 1)
        assert.equal(children[0].attrs.relay_name, `gru2c0${index + 1}`)
        assert.equal(children.some((child) => child.tag === 'destination'), false)
    }
})

test('handleCallTerminate only ends the matching call', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    const callIdA = await manager.startCall({ peerJid: '2222222222@lid' })
    const callIdB = await manager.startCall({ peerJid: '3333333333@lid' })

    await manager.handleCallTerminate(buildTerminateNode(callIdA))

    assert.equal(manager.getCall(callIdA), null)
    assert.ok(manager.getCall(callIdB))
    assert.equal(manager.getCall(callIdB)!.stateData.state, CallState.Ringing)
})

test('call_inbound_audio event includes CallInfo', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)

    let receivedCall: CallInfo | null = null
    manager.on('call_inbound_audio', (info) => {
        receivedCall = info
    })

    manager.emit('call_inbound_audio', call, new Float32Array(960))
    assert.equal(receivedCall, call)
})
