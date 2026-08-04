import type { Logger } from 'zapo-js'
import { toUserJid } from 'zapo-js/protocol'
import { type BinaryNode, getFirstNodeChild, getNodeChildrenByTag } from 'zapo-js/transport'
import { toError } from 'zapo-js/util'

import { concatBytes, EMPTY_BYTES, readUInt32BE, toArrayBuffer } from '../bytes.js'
import { derivePerJidSrtpKey } from '../crypto/encryption.js'
import { SrtpSession } from '../crypto/srtp.js'
import {
    e2eParticipantIdVariants,
    formatE2ESrtpParticipantId,
    generateSecureSsrc,
    generateWasmRelayStreamSsrcs,
    prepareWasmRelayStreamSsrcs
} from '../crypto/ssrc.js'
import { MLowCodec } from '../media/mlow-codec.js'
import { isOpusDtxPayload, isWhatsappOpusPayloadType, RtpSession } from '../media/rtp.js'
import { WaAudioEngine } from '../media/WaAudioEngine.js'
import { parseRelayFromAck } from '../relay/relay-ack.js'
import { normalizeRelayEndpoints, selectMediaRelayEndpoint } from '../relay/relay-endpoints.js'
import { isRtpPacket, isStunPacket } from '../relay/stun.js'
import { WaSctpRelay } from '../relay/WaSctpRelay.js'
import {
    buildAcceptReceiptStanza,
    buildAcceptStanza,
    buildPreacceptStanza,
    buildRejectStanza,
    buildRelayLatencyStanza,
    buildTerminateStanza,
    extractNodeInfo,
    extractRelayEndpoints
} from '../signaling/signaling.js'
import {
    type AudioSender,
    CallDirection,
    CallMediaType,
    CallState,
    EndCallReason,
    type RelayEndpoint,
    SRTP_AUTH_TAG_LEN,
    SRTP_RECV_AUTH_TAG_LEN,
    SRTP_SEND_AUTH_TAG_LEN,
    type WaVoipDeps
} from '../types.js'

import { type CallInfo } from './call-state.js'

export interface WaCallMediaSessionDelegate {
    emitState(call: CallInfo): void
    emitIncoming(call: CallInfo): void
    emitEnded(call: CallInfo): void
    emitInboundAudio(call: CallInfo, data: Float32Array): void
    emitOutboundAudioFinished(call: CallInfo): void
}

export interface WaCallMediaSessionOptions {
    readonly deps: WaVoipDeps
    readonly logger: Logger
    readonly info: CallInfo
    readonly delegate: WaCallMediaSessionDelegate
}

export class WaCallMediaSession implements AudioSender {
    readonly info: CallInfo

    private readonly deps: WaVoipDeps
    private readonly logger: Logger
    private readonly delegate: WaCallMediaSessionDelegate

    private rtpSession: RtpSession | null = null
    private srtpSession: SrtpSession | null = null
    private opusCodec: MLowCodec | null = null
    private readonly sctpRelay: WaSctpRelay
    private readonly audioEngine: WaAudioEngine

    private selfSsrc = 0
    private selfStreamSsrcs: number[] = []
    private peerSsrcs: number[] = []

    private acceptedByJid: string | null = null
    private acceptPending = false
    private acceptSent = false
    private remoteMuteObserved = false
    private readonly debeEnabled = true

    private audioSendCount = 0
    private audioDropCount = 0
    private realAudioSendCount = 0

    private static readonly EMPTY_BYTES = EMPTY_BYTES

    private encodeBufferA: Float32Array | null = null
    private encodeBufferB: Float32Array | null = null
    private encodeBuffer: Float32Array | null = null
    private encodeBufferPos = 0
    private authPaddingBuffer: Uint8Array | null = null

    private audioRecvCount = 0
    private recvRealCount = 0
    private recvDtxCount = 0
    private srtpErrorCount = 0
    private relayPacketCount = 0
    private stunResponseCount = 0
    private selfEchoCount = 0
    private lastRecvSeq = -1
    private recvSeqGaps = 0
    private actualPeerSsrc: number | null = null
    private ssrcResubscribed = false

    constructor(options: WaCallMediaSessionOptions) {
        this.deps = options.deps
        this.logger = options.logger
        this.info = options.info
        this.delegate = options.delegate

        this.sctpRelay = new WaSctpRelay({
            logger: this.logger.child({ component: 'sctp' })
        })

        this.audioEngine = new WaAudioEngine({
            logger: this.logger.child({ component: 'audio-engine' })
        })
        this.audioEngine.setAudioSender(this)
        this.audioEngine.setOnAudioFinished(() => {
            this.delegate.emitOutboundAudioFinished(this.info)
        })

        this.sctpRelay.on('relay_connected', () => {
            this.onRelayConnected()
        })
        this.sctpRelay.on(
            'relay_receive',
            (relayInfo: { ip: string; port: number; data: Uint8Array }) => {
                this.onRelayData(relayInfo.data)
            }
        )
    }

    get callId(): string {
        return this.info.callId
    }

    async initMedia(selfLid: string, peerJid: string): Promise<void> {
        const selfDeviceJid = formatE2ESrtpParticipantId(selfLid)
        const ssrc = generateSecureSsrc(this.info.callId, selfDeviceJid)
        this.rtpSession = RtpSession.whatsappOpus(ssrc)
        this.selfSsrc = ssrc
        const derivedStreamSsrcs = generateWasmRelayStreamSsrcs(this.info.callId, selfDeviceJid)
        this.selfStreamSsrcs = prepareWasmRelayStreamSsrcs(
            derivedStreamSsrcs,
            generateSecureSsrc(this.info.callId, selfDeviceJid, 6)
        )

        const peerSsrc = generateSecureSsrc(
            this.info.callId,
            formatE2ESrtpParticipantId(peerJid)
        )
        this.peerSsrcs = [peerSsrc]

        this.logger.debug('call media initialized', {
            callId: this.info.callId,
            selfSsrc: `0x${ssrc.toString(16).toUpperCase()}`,
            peerSsrc: `0x${peerSsrc.toString(16).toUpperCase()}`
        })

        this.opusCodec = await MLowCodec.create()
    }

    async acceptCall(): Promise<void> {
        if (!this.info.canAccept) {
            throw new Error(
                `Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`
            )
        }

        this.info.applyTransition({ type: 'local_accepted' })
        this.delegate.emitState(this.info)

        const callId = this.info.callId
        const peerJid = this.info.peerJid

        this.acceptedByJid = peerJid
        this.initSrtpKeys()
        this.acceptPending = true
        if (this.remoteMuteObserved) await this.sendPendingAccept()

        if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }

        this.logger.debug('call answer committed; waiting for caller mute_v2', {
            callId,
            remoteMuteObserved: this.remoteMuteObserved
        })
    }

    async rejectCall(reason: EndCallReason = EndCallReason.Declined): Promise<void> {
        this.info.applyTransition({ type: 'local_rejected', reason })
        this.delegate.emitState(this.info)

        const node = buildRejectStanza(this.info.peerJid, this.info.callId, this.info.callCreator)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('reject send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    async endCall(reason: EndCallReason = EndCallReason.UserEnded): Promise<void> {
        if (this.info.isEnded) return

        const connectedAt = this.info.stateData.connectedAt
        const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined

        this.info.applyTransition({ type: 'terminated', reason })

        const terminateTarget = this.acceptedByJid ?? this.info.peerJid
        const node = buildTerminateStanza(
            terminateTarget,
            this.info.callId,
            this.info.callCreator,
            audioDurationMs
        )
        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        try {
            await this.deps.lowLevelCoordinator.sendNode(node)
        } catch (err) {
            this.logger.warn('terminate send failed', { message: toError(err).message })
        }
        this.cleanup()
    }

    setMute(muted: boolean): void {
        if (!this.info.isActive) return

        this.info.applyTransition({ type: 'audio_mute_changed', muted })
        this.delegate.emitState(this.info)

        if (muted) {
            this.audioEngine.stopCapture()
        } else {
            this.audioEngine.startCapture()
        }
    }

    async loadAudio(audioPath: string): Promise<void> {
        await this.audioEngine.loadAudioFile(audioPath)
        this.resetEncodeState()
        this.logger.debug('audio loaded for call', { callId: this.info.callId })
    }

    setExternalAudioMode(enabled: boolean): void {
        this.audioEngine.setExternalMode(enabled)
        if (enabled) {
            this.resetEncodeState()
            this.logger.debug('external audio mode enabled', { callId: this.info.callId })
        }
    }

    feedLiveAudio(data: Float32Array): number {
        return this.audioEngine.feedExternalAudio(data)
    }

    getLiveBufferMs(): number {
        return this.audioEngine.getLiveBufferMs()
    }

    async sendIncomingPreaccept(peerJid: string): Promise<void> {
        try {
            const preacceptNode = buildPreacceptStanza(
                peerJid,
                this.info.callId,
                this.info.callCreator
            )
            await this.deps.lowLevelCoordinator.sendNode(preacceptNode)
        } catch (err: unknown) {
            this.logger.error('error sending preaccept', {
                message: toError(err).message
            })
        }
    }

    async handleCallAccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        try {
            this.info.applyTransition({ type: 'remote_accepted' })
            this.delegate.emitState(this.info)
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? ''
        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const ourJid = meLid || meId
        const callId = this.info.callId
        const callCreator = this.info.callCreator
        const acceptingDeviceJid = peerJid

        this.acceptedByJid = acceptingDeviceJid

        if (this.actualPeerSsrc !== null) {
            const calculatedJid = formatE2ESrtpParticipantId(acceptingDeviceJid)
            this.logger.debug('accept keeping actual peer ssrc', {
                callId,
                actualPeerSsrc: `0x${this.actualPeerSsrc.toString(16)}`,
                calculatedJid
            })
        } else {
            const peerDeviceJidForSsrc = formatE2ESrtpParticipantId(acceptingDeviceJid)
            const acceptSsrc = generateSecureSsrc(callId, peerDeviceJidForSsrc)
            this.peerSsrcs = [acceptSsrc]
            this.logger.debug('accept ssrc assigned', {
                callId,
                jid: peerDeviceJidForSsrc,
                ssrc: `0x${acceptSsrc.toString(16)}`
            })
        }
        this.sctpRelay.setSubscriptionSsrcs(this.peerSsrcs)
        this.sctpRelay.setParticipantPids(
            this.info.relayData?.selfPid,
            this.info.relayData?.peerPid
        )
        this.sctpRelay.resendSubscriptions()

        this.initSrtpKeys()

        const acceptMsgId = node.attrs?.id
        if (acceptMsgId) {
            try {
                const receiptNode = buildAcceptReceiptStanza(
                    acceptingDeviceJid,
                    acceptMsgId,
                    callId,
                    callCreator,
                    ourJid
                )
                await this.deps.lowLevelCoordinator.sendNode(receiptNode)
            } catch (err: unknown) {
                this.logger.error('error sending accept receipt', {
                    message: toError(err).message
                })
            }
        }

        if (this.sctpRelay.hasConnection()) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
            } catch (err) {
                this.logger.trace('call transition skipped', { message: toError(err).message })
            }
        } else if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints)
        }
    }

    async handleCallPreaccept(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        // Outbound preaccept is only a peer state notification. The caller must keep
        // using the relay selected by the offer ACK; emitting synthetic transport or
        // relaylatency stanzas here can make the handset elect a nonexistent P2P path.
    }

    async handleCallTransport(_node: BinaryNode): Promise<void> {
        const nodeInfo = extractNodeInfo(_node)
        if (!nodeInfo) return

        const relays = extractRelayEndpoints(nodeInfo.innerNode)
        if (relays.length > 0 && !this.sctpRelay.hasConnection()) {
            this.info.relayData = {
                ...this.info.relayData,
                endpoints: relays
            }
            await this.connectRelays(relays)
        }
    }

    async handleCallAck(node: BinaryNode): Promise<void> {
        const ackType = node.attrs?.type
        if (ackType !== 'offer') return

        const error = node.attrs?.error
        if (error) {
            this.logger.error('ack error', { callId: this.info.callId, error })
            return
        }

        const {
            relays,
            participantJids,
            selfParticipantJid,
            peerParticipantJid,
            uuid,
            selfPid,
            peerPid,
            hbhKey
        } = parseRelayFromAck(node)

        if (relays.length > 0) {
            this.info.relayData = {
                endpoints: relays,
                participantJids,
                selfParticipantJid,
                peerParticipantJid,
                uuid,
                selfPid,
                peerPid,
                hbhKey
            }

            this.logger.debug('offer ack relays parsed', {
                callId: this.info.callId,
                relayCount: relays.length,
                participantCount: participantJids.length,
                selfParticipantJid,
                peerParticipantJid
            })

            const callKey = this.info.encryptionKey
            if (participantJids.length > 0) {
                const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
                const meId = this.deps.authClient.getCurrentCredentials()?.meJid
                const ourCredJid = meLid || meId || ''
                const ourBase = ourCredJid ? toUserJid(ourCredJid) : ''

                const ourDeviceJid = formatE2ESrtpParticipantId(
                    participantJids.find((jid) => {
                        const jidBase = toUserJid(jid)
                        return jidBase === ourBase && /:\d+@/.test(jid)
                    }) || ourCredJid
                )

                const peerJids = participantJids.filter((jid) => {
                    const jidBase = toUserJid(jid)
                    return jidBase !== ourBase
                })
                const newSelfSsrc = generateSecureSsrc(this.info.callId, ourDeviceJid)
                if (newSelfSsrc !== this.selfSsrc) {
                    this.selfSsrc = newSelfSsrc
                    this.rtpSession = RtpSession.whatsappOpus(newSelfSsrc)
                }
                const derivedStreamSsrcs = generateWasmRelayStreamSsrcs(
                    this.info.callId,
                    ourDeviceJid
                )
                this.selfStreamSsrcs = prepareWasmRelayStreamSsrcs(
                    derivedStreamSsrcs,
                    generateSecureSsrc(this.info.callId, ourDeviceJid, 6)
                )

                if (peerJids.length > 0) {
                    this.peerSsrcs = [
                        ...new Set(
                            peerJids.map((jid) =>
                                generateSecureSsrc(
                                    this.info.callId,
                                    formatE2ESrtpParticipantId(jid)
                                )
                            )
                        )
                    ]
                }

                if (callKey) {
                    this.initSrtpKeys()
                } else {
                    this.logger.debug('no call_key, srtp not initialized', {
                        callId: this.info.callId
                    })
                }
            }

            await this.connectRelays(relays)

            if (
                this.srtpSession &&
                this.rtpSession &&
                this.opusCodec &&
                this.sctpRelay.hasConnection()
            ) {
                this.audioEngine.startSilenceCapture()
            }
        }
    }

    async handleCallRelaylatency(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return

        const inner = nodeInfo.innerNode
        const callId = inner.attrs?.['call-id'] || this.info.callId
        const callCreator = inner.attrs?.['call-creator'] || this.info.callCreator

        const teNodes = getNodeChildrenByTag(inner, 'te')

        if (teNodes.length === 0) return

        for (const teNode of teNodes) {
            const encodedLatency = Number(teNode.attrs?.latency)
            const latency = Number.isSafeInteger(encodedLatency) && encodedLatency >= 0x02000000
                ? encodedLatency - 0x02000000
                : 0
            const relayName = teNode.attrs?.relay_name || ''
            if (!relayName) continue
            try {
                const response = buildRelayLatencyStanza(
                    peerJid,
                    callId,
                    callCreator,
                    [{ relayName, latency, addressBytes: teNode.content instanceof Uint8Array ? teNode.content : undefined }],
                    []
                )
                await this.deps.lowLevelCoordinator.sendNode(response)
            } catch (err: unknown) {
                this.logger.error('error responding to relaylatency', {
                    relayName,
                    message: toError(err).message
                })
                return
            }
        }
    }

    handleRelayElection(node: BinaryNode): void {
        const inner = getFirstNodeChild(node)
        if (!inner) return

        let electedRelayIdx: number | undefined
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            const parsed = Number(inner.attrs['elected_relay_idx'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.attrs?.['relay_id'] !== undefined) {
            const parsed = Number(inner.attrs['relay_id'])
            if (Number.isSafeInteger(parsed) && parsed >= 0) electedRelayIdx = parsed
        } else if (inner.content instanceof Uint8Array) {
            const bytes = inner.content
            if (bytes.length >= 4) electedRelayIdx = readUInt32BE(bytes, 0)
            else if (bytes.length > 0) electedRelayIdx = bytes[0]
        }

        if (electedRelayIdx !== undefined) {
            this.info.electedRelayIdx = electedRelayIdx
            this.logger.debug('elected relay index', {
                callId: this.info.callId,
                electedRelayIdx
            })
        }
    }

    async handleCallMuteV2(node: BinaryNode, peerJid: string): Promise<void> {
        const nodeInfo = extractNodeInfo(node)
        if (!nodeInfo) return
        this.remoteMuteObserved = true
        if (this.info.direction === CallDirection.Incoming && this.acceptPending) {
            this.acceptedByJid = peerJid
            await this.sendPendingAccept()
        }
    }

    handleCallTerminate(): void {
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: EndCallReason.UserEnded
            })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    handleCallReject(): void {
        try {
            this.info.applyTransition({
                type: 'remote_rejected',
                reason: EndCallReason.Declined
            })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    handleCallAckError(error: string): void {
        this.logger.error('offer rejected by server', { callId: this.info.callId, error })
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: EndCallReason.Failed
            })
        } catch (err) {
            this.logger.trace('call transition skipped', { message: toError(err).message })
        }

        this.delegate.emitEnded(this.info)
        this.delegate.emitState(this.info)
        this.cleanup()
    }

    sendCapturedAudio(data: Float32Array): void {
        const hasRelay = this.sctpRelay.hasConnection()
        if (!this.rtpSession || !this.srtpSession || !this.opusCodec || !hasRelay) {
            this.audioDropCount++
            if (this.audioDropCount === 1 || this.audioDropCount % 500 === 0) {
                const missing = [
                    !this.rtpSession && 'rtpSession',
                    !this.srtpSession && 'srtpSession',
                    !this.opusCodec && 'opusCodec',
                    !hasRelay && 'relayConnection'
                ]
                    .filter(Boolean)
                    .join(', ')
                this.logger.debug('audio dropped', {
                    callId: this.info.callId,
                    dropCount: this.audioDropCount,
                    missing
                })
            }
            return
        }

        for (let i = 0; i < data.length; i++) {
            if (!Number.isFinite(data[i])) {
                data[i] = 0
            }
        }

        const frameSamples = this.encodeFrameSamples
        if (!this.encodeBuffer) {
            if (!this.encodeBufferA) {
                this.encodeBufferA = new Float32Array(frameSamples)
                this.encodeBufferB = new Float32Array(frameSamples)
            }
            this.encodeBuffer = this.encodeBufferA
            this.encodeBufferPos = 0
        }

        let offset = 0
        while (offset < data.length) {
            const toCopy = Math.min(data.length - offset, frameSamples - this.encodeBufferPos)
            this.encodeBuffer.set(data.subarray(offset, offset + toCopy), this.encodeBufferPos)
            this.encodeBufferPos += toCopy
            offset += toCopy

            if (this.encodeBufferPos < frameSamples) break

            const frameData: Float32Array = this.encodeBuffer
            this.encodeBuffer =
                frameData === this.encodeBufferA ? this.encodeBufferB! : this.encodeBufferA!
            this.encodeBufferPos = 0

            try {
                const opusFrame = this.opusCodec.encode(frameData)
                this.sendOpusFrame(opusFrame, false)
                this.realAudioSendCount++
            } catch (err: unknown) {
                this.logger.error('encode error', {
                    callId: this.info.callId,
                    message: toError(err).message
                })
            }
        }
    }

    cleanup(): void {
        const opusStats = this.opusCodec?.getStats()
        this.logger.debug('call stats', {
            callId: this.info.callId,
            relayPackets: this.relayPacketCount,
            recvOk: this.audioRecvCount,
            srtpErrors: this.srtpErrorCount,
            sent: this.audioSendCount,
            dropped: this.audioDropCount,
            opusOk: opusStats?.success ?? 0,
            opusErr: opusStats?.errors ?? 0
        })

        this.audioEngine.setOnAudioFinished(null)
        this.audioEngine.stop()
        this.sctpRelay.cleanup()

        if (this.opusCodec) {
            this.opusCodec.destroy()
            this.opusCodec = null
        }

        this.rtpSession = null
        this.srtpSession = null

        this.audioSendCount = 0
        this.audioDropCount = 0
        this.audioRecvCount = 0
        this.srtpErrorCount = 0
        this.relayPacketCount = 0
        this.stunResponseCount = 0
        this.selfEchoCount = 0
        this.lastRecvSeq = -1
        this.recvSeqGaps = 0
        this.actualPeerSsrc = null
        this.ssrcResubscribed = false
        this.recvRealCount = 0
        this.recvDtxCount = 0
        this.realAudioSendCount = 0
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.acceptedByJid = null
        this.acceptPending = false
        this.acceptSent = false
        this.remoteMuteObserved = false
        this.selfStreamSsrcs = []
    }

    private get encodeFrameSamples(): number {
        return this.opusCodec?.getFrameSize() ?? 960
    }

    private get rtpTsDelta(): number {
        return this.encodeFrameSamples
    }

    private sendOpusFrame(opusFrame: Uint8Array, isSilence: boolean): void {
        if (!this.rtpSession || !this.srtpSession) return

        try {
            let rtpPayload: Uint8Array = opusFrame

            const authPadding = SRTP_AUTH_TAG_LEN - SRTP_SEND_AUTH_TAG_LEN
            if (authPadding > 0) {
                if (!this.authPaddingBuffer || this.authPaddingBuffer.length !== authPadding) {
                    this.authPaddingBuffer = new Uint8Array(authPadding)
                }
                rtpPayload = concatBytes([rtpPayload, this.authPaddingBuffer])
            }

            const tsDelta = this.rtpTsDelta
            const rtpPacket = this.rtpSession.createWhatsappOpusPacket(opusFrame, tsDelta, rtpPayload)

            if (this.debeEnabled) {
                rtpPacket.header.extension = true
                rtpPacket.header.extensionProfile = 0xdebe
                rtpPacket.header.extensionData = isOpusDtxPayload(opusFrame)
                    ? new Uint8Array([0x30, 0x01, 0x00, 0x00])
                    : WaCallMediaSession.EMPTY_BYTES
            }

            const srtpData = this.srtpSession.protect(rtpPacket)
            this.sctpRelay.broadcast(toArrayBuffer(srtpData))

            this.audioSendCount++
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug('audio sent', {
                    callId: this.info.callId,
                    sendCount: this.audioSendCount,
                    opusBytes: opusFrame.length,
                    srtpBytes: srtpData.length,
                    silence: isSilence
                })
            }
        } catch (err: unknown) {
            this.logger.error('error sending audio', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private initSrtpKeys(): void {
        const callKey = this.info.encryptionKey
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId })
            return
        }

        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid
        const meId = this.deps.authClient.getCurrentCredentials()?.meJid
        const ourCredJid = meLid || meId || ''
        const ourBase = toUserJid(ourCredJid)
        const participants = this.info.relayData?.participantJids || []

        const ourDeviceJid = formatE2ESrtpParticipantId(
            this.info.relayData?.selfParticipantJid ||
                participants.find((jid) => {
                    const jBase = toUserJid(jid)
                    return jBase === ourBase && /:\d+@/.test(jid)
                }) ||
                ourCredJid
        )

        let rawPeerJid =
            this.info.relayData?.peerParticipantJid || this.acceptedByJid || this.info.peerJid
        if (!this.info.relayData?.peerParticipantJid && !this.acceptedByJid) {
            const peerFromParticipants = participants.find((jid) => {
                const jBase = toUserJid(jid)
                return jBase !== ourBase
            })
            if (peerFromParticipants) rawPeerJid = peerFromParticipants
        }
        const peerDeviceJid = formatE2ESrtpParticipantId(rawPeerJid)

        try {
            const sendKeying = derivePerJidSrtpKey(callKey, ourDeviceJid)
            const peerKeyJids = e2eParticipantIdVariants(peerDeviceJid)
            const receiveKeyings = peerKeyJids.map((jid) => derivePerJidSrtpKey(callKey, jid))

            this.srtpSession = new SrtpSession(
                sendKeying,
                receiveKeyings[0],
                SRTP_SEND_AUTH_TAG_LEN,
                SRTP_RECV_AUTH_TAG_LEN
            )
            this.srtpSession.setReceiveKeyings(receiveKeyings)
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJids: peerKeyJids
            })
        } catch (err: unknown) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private resetEncodeState(): void {
        this.encodeBuffer = null
        this.encodeBufferPos = 0
        this.realAudioSendCount = 0
    }

    private async sendPendingAccept(): Promise<void> {
        if (!this.acceptPending || this.acceptSent) return

        const acceptStanza = await buildAcceptStanza(
            this.info.callId,
            this.acceptedByJid || this.info.peerJid,
            this.info.callCreator,
            this.info.mediaType === CallMediaType.Video
        )
        try {
            await this.deps.lowLevelCoordinator.sendNode(acceptStanza)
            this.acceptPending = false
            this.acceptSent = true
            this.logger.debug('accept sent after caller mute_v2', { callId: this.info.callId })
        } catch (err: unknown) {
            this.logger.error('accept send error', { message: toError(err).message })
        }
    }

    private onRelayConnected(): void {
        if (this.info.stateData.state === CallState.Connecting) {
            try {
                this.info.applyTransition({ type: 'media_connected' })
                this.delegate.emitState(this.info)
                this.startMediaFlow()
                this.logger.debug('relay connected, call active', { callId: this.info.callId })
            } catch (err) {
                this.logger.trace('call transition skipped', { message: toError(err).message })
            }
            return
        }

        if (
            !this.info.isEnded &&
            this.srtpSession &&
            this.rtpSession &&
            this.opusCodec
        ) {
            this.audioEngine.startSilenceCapture()
            this.logger.debug('relay connected, early RTP warmup started', {
                callId: this.info.callId,
                state: this.info.stateData.state
            })
        }
    }

    private onRelayData(data: Uint8Array): void {
        this.relayPacketCount++

        if (isStunPacket(data)) {
            this.stunResponseCount++
            return
        }

        if (!isRtpPacket(data)) return

        const pt = data[1] & 0x7f
        if (!this.srtpSession || !this.opusCodec) return
        if (!isWhatsappOpusPayloadType(pt)) return

        if (data.length >= 12) {
            const ssrc = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0
            if (ssrc === this.selfSsrc) {
                this.selfEchoCount++
                return
            }

            if (!this.ssrcResubscribed && this.actualPeerSsrc === null) {
                this.actualPeerSsrc = ssrc
                const knownSsrc = this.peerSsrcs.includes(ssrc)
                if (!knownSsrc) {
                    this.peerSsrcs = [ssrc]
                    this.ssrcResubscribed = true
                    this.sctpRelay.setSubscriptionSsrcs(this.peerSsrcs)
                    this.sctpRelay.resendSubscriptions()
                }
            }
        }

        try {
            const rtpPacket = this.srtpSession.unprotect(data)
            const opusPayload = rtpPacket.payload

            this.audioRecvCount++

            if (opusPayload.length === 0) return

            const seq = rtpPacket.header.sequenceNumber
            if (this.lastRecvSeq >= 0) {
                const expected = (this.lastRecvSeq + 1) & 0xffff
                if (seq !== expected) {
                    const gap = ((seq - this.lastRecvSeq + 65536) % 65536) - 1
                    this.recvSeqGaps += gap
                }
            }
            this.lastRecvSeq = seq

            const isDtx = isOpusDtxPayload(opusPayload)
            if (isDtx) this.recvDtxCount++
            else this.recvRealCount++

            let audioData = this.opusCodec.decode(opusPayload)

            if (audioData.length > 0 && audioData.length < 960) {
                const padded = new Float32Array(960)
                padded.set(audioData)
                audioData = padded
            }

            this.audioEngine.onPlaybackData(audioData)
            this.delegate.emitInboundAudio(this.info, audioData)

            if (this.audioRecvCount % 100 === 0) {
                const stats = this.opusCodec.getStats()
                this.logger.debug('audio recv stats', {
                    callId: this.info.callId,
                    recvCount: this.audioRecvCount,
                    real: this.recvRealCount,
                    dtx: this.recvDtxCount,
                    decodeOk: stats.success,
                    decodeErr: stats.errors
                })
            }
        } catch (err: unknown) {
            this.srtpErrorCount++
            if (this.srtpErrorCount <= 5) {
                const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0
                this.logger.debug('srtp recv error', {
                    callId: this.info.callId,
                    errorCount: this.srtpErrorCount,
                    message: toError(err).message,
                    ssrc: `0x${ssrc.toString(16)}`
                })
            }
        }
    }

    private async connectRelays(endpoints: RelayEndpoint[]): Promise<void> {
        this.logger.debug('connecting relays', {
            callId: this.info.callId,
            endpointCount: endpoints.length
        })

        const selectedEndpoint = selectMediaRelayEndpoint(
            endpoints,
            this.info.direction === CallDirection.Incoming
        )
        const relays = selectedEndpoint
            ? normalizeRelayEndpoints([selectedEndpoint], { includeWebTokenFallback: false })
            : []

        if (relays.length === 0) {
            this.logger.error('no relay configs', { callId: this.info.callId })
            return
        }

        this.logger.debug('media relays selected', {
            callId: this.info.callId,
            direction: this.info.direction,
            relays: relays.map((relay) => ({
                relayName: relay.name,
                ip: relay.ip,
                port: relay.port,
                authTokenId: relay.authTokenId,
                isFna: relay.isFna === true
            }))
        })

        if (this.selfStreamSsrcs.length !== 9) {
            this.logger.error('WASM relay streams not initialized', { callId: this.info.callId })
            return
        }

        this.sctpRelay.setSsrc(this.selfSsrc)
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs)
        this.sctpRelay.setSubscriptionSsrcs(this.peerSsrcs)
        this.sctpRelay.setParticipantPids(
            this.info.relayData?.selfPid,
            this.info.relayData?.peerPid
        )

        try {
            await this.sctpRelay.configureRelays(relays)
            this.logger.debug('sctp relays configured', {
                callId: this.info.callId,
                connected: this.sctpRelay.getConnectedCount()
            })
        } catch (err: unknown) {
            this.logger.error('sctp relay error', {
                callId: this.info.callId,
                message: toError(err).message
            })
        }
    }

    private startMediaFlow(): void {
        this.resetEncodeState()
        this.audioEngine.startPlayback()
        this.audioEngine.startCapture()
    }
}
