"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaCallMediaSession = void 0;
const protocol_1 = require("zapo-js/protocol");
const transport_1 = require("zapo-js/transport");
const util_1 = require("zapo-js/util");
const bytes_js_1 = require("../bytes.js");
const encryption_js_1 = require("../crypto/encryption.js");
const srtp_js_1 = require("../crypto/srtp.js");
const ssrc_js_1 = require("../crypto/ssrc.js");
const mlow_codec_js_1 = require("../media/mlow-codec.js");
const rtp_js_1 = require("../media/rtp.js");
const WaAudioEngine_js_1 = require("../media/WaAudioEngine.js");
const relay_ack_js_1 = require("../relay/relay-ack.js");
const relay_endpoints_js_1 = require("../relay/relay-endpoints.js");
const stun_js_1 = require("../relay/stun.js");
const WaSctpRelay_js_1 = require("../relay/WaSctpRelay.js");
const signaling_js_1 = require("../signaling/signaling.js");
const types_js_1 = require("../types.js");
class WaCallMediaSession {
    info;
    deps;
    logger;
    delegate;
    rtpSession = null;
    srtpSession = null;
    opusCodec = null;
    sctpRelay;
    audioEngine;
    selfSsrc = 0;
    selfStreamSsrcs = [];
    peerSsrcs = [];
    acceptedByJid = null;
    acceptPending = false;
    acceptSent = false;
    remoteMuteObserved = false;
    debeEnabled = true;
    audioSendCount = 0;
    audioDropCount = 0;
    realAudioSendCount = 0;
    static EMPTY_BYTES = bytes_js_1.EMPTY_BYTES;
    encodeBufferA = null;
    encodeBufferB = null;
    encodeBuffer = null;
    encodeBufferPos = 0;
    authPaddingBuffer = null;
    audioRecvCount = 0;
    recvRealCount = 0;
    recvDtxCount = 0;
    srtpErrorCount = 0;
    relayPacketCount = 0;
    stunResponseCount = 0;
    selfEchoCount = 0;
    lastRecvSeq = -1;
    recvSeqGaps = 0;
    actualPeerSsrc = null;
    ssrcResubscribed = false;
    constructor(options) {
        this.deps = options.deps;
        this.logger = options.logger;
        this.info = options.info;
        this.delegate = options.delegate;
        this.sctpRelay = new WaSctpRelay_js_1.WaSctpRelay({
            logger: this.logger.child({ component: 'sctp' })
        });
        this.audioEngine = new WaAudioEngine_js_1.WaAudioEngine({
            logger: this.logger.child({ component: 'audio-engine' })
        });
        this.audioEngine.setAudioSender(this);
        this.audioEngine.setOnAudioFinished(() => {
            this.delegate.emitOutboundAudioFinished(this.info);
        });
        this.sctpRelay.on('relay_connected', () => {
            this.onRelayConnected();
        });
        this.sctpRelay.on('relay_receive', (relayInfo) => {
            this.onRelayData(relayInfo.data);
        });
    }
    get callId() {
        return this.info.callId;
    }
    async initMedia(selfLid, peerJid) {
        const selfDeviceJid = (0, ssrc_js_1.formatE2ESrtpParticipantId)(selfLid);
        const ssrc = (0, ssrc_js_1.generateSecureSsrc)(this.info.callId, selfDeviceJid);
        this.rtpSession = rtp_js_1.RtpSession.whatsappOpus(ssrc);
        this.selfSsrc = ssrc;
        const derivedStreamSsrcs = (0, ssrc_js_1.generateWasmRelayStreamSsrcs)(this.info.callId, selfDeviceJid);
        this.selfStreamSsrcs = (0, ssrc_js_1.prepareWasmRelayStreamSsrcs)(derivedStreamSsrcs, (0, ssrc_js_1.generateSecureSsrc)(this.info.callId, selfDeviceJid, 6));
        const peerSsrc = (0, ssrc_js_1.generateSecureSsrc)(this.info.callId, (0, ssrc_js_1.formatE2ESrtpParticipantId)(peerJid));
        this.peerSsrcs = [peerSsrc];
        this.logger.debug('call media initialized', {
            callId: this.info.callId,
            selfSsrc: `0x${ssrc.toString(16).toUpperCase()}`,
            peerSsrc: `0x${peerSsrc.toString(16).toUpperCase()}`
        });
        this.opusCodec = await mlow_codec_js_1.MLowCodec.create();
    }
    async acceptCall() {
        if (!this.info.canAccept) {
            throw new Error(`Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`);
        }
        this.info.applyTransition({ type: 'local_accepted' });
        this.delegate.emitState(this.info);
        const callId = this.info.callId;
        const peerJid = this.info.peerJid;
        this.acceptedByJid = peerJid;
        this.initSrtpKeys();
        this.acceptPending = true;
        if (this.remoteMuteObserved)
            await this.sendPendingAccept();
        if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints);
        }
        this.logger.debug('call answer committed; waiting for caller mute_v2', {
            callId,
            remoteMuteObserved: this.remoteMuteObserved
        });
    }
    async rejectCall(reason = types_js_1.EndCallReason.Declined) {
        this.info.applyTransition({ type: 'local_rejected', reason });
        this.delegate.emitState(this.info);
        const node = (0, signaling_js_1.buildRejectStanza)(this.info.peerJid, this.info.callId, this.info.callCreator);
        try {
            await this.deps.lowLevelCoordinator.sendNode(node);
        }
        catch (err) {
            this.logger.warn('reject send failed', { message: (0, util_1.toError)(err).message });
        }
        this.cleanup();
    }
    async endCall(reason = types_js_1.EndCallReason.UserEnded) {
        if (this.info.isEnded)
            return;
        const connectedAt = this.info.stateData.connectedAt;
        const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined;
        this.info.applyTransition({ type: 'terminated', reason });
        const terminateTarget = this.acceptedByJid ?? this.info.peerJid;
        const node = (0, signaling_js_1.buildTerminateStanza)(terminateTarget, this.info.callId, this.info.callCreator, audioDurationMs);
        this.delegate.emitEnded(this.info);
        this.delegate.emitState(this.info);
        try {
            await this.deps.lowLevelCoordinator.sendNode(node);
        }
        catch (err) {
            this.logger.warn('terminate send failed', { message: (0, util_1.toError)(err).message });
        }
        this.cleanup();
    }
    setMute(muted) {
        if (!this.info.isActive)
            return;
        this.info.applyTransition({ type: 'audio_mute_changed', muted });
        this.delegate.emitState(this.info);
        if (muted) {
            this.audioEngine.stopCapture();
        }
        else {
            this.audioEngine.startCapture();
        }
    }
    async loadAudio(audioPath) {
        await this.audioEngine.loadAudioFile(audioPath);
        this.resetEncodeState();
        this.logger.debug('audio loaded for call', { callId: this.info.callId });
    }
    setExternalAudioMode(enabled) {
        this.audioEngine.setExternalMode(enabled);
        if (enabled) {
            this.resetEncodeState();
            this.logger.debug('external audio mode enabled', { callId: this.info.callId });
        }
    }
    feedLiveAudio(data) {
        return this.audioEngine.feedExternalAudio(data);
    }
    getLiveBufferMs() {
        return this.audioEngine.getLiveBufferMs();
    }
    async sendIncomingPreaccept(peerJid) {
        try {
            const preacceptNode = (0, signaling_js_1.buildPreacceptStanza)(peerJid, this.info.callId, this.info.callCreator);
            await this.deps.lowLevelCoordinator.sendNode(preacceptNode);
        }
        catch (err) {
            this.logger.error('error sending preaccept', {
                message: (0, util_1.toError)(err).message
            });
        }
    }
    async handleCallAccept(node, peerJid) {
        const nodeInfo = (0, signaling_js_1.extractNodeInfo)(node);
        if (!nodeInfo)
            return;
        try {
            this.info.applyTransition({ type: 'remote_accepted' });
            this.delegate.emitState(this.info);
        }
        catch (err) {
            this.logger.trace('call transition skipped', { message: (0, util_1.toError)(err).message });
        }
        const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? '';
        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
        const ourJid = meLid || meId;
        const callId = this.info.callId;
        const callCreator = this.info.callCreator;
        const acceptingDeviceJid = peerJid;
        this.acceptedByJid = acceptingDeviceJid;
        if (this.actualPeerSsrc !== null) {
            const calculatedJid = (0, ssrc_js_1.formatE2ESrtpParticipantId)(acceptingDeviceJid);
            this.logger.debug('accept keeping actual peer ssrc', {
                callId,
                actualPeerSsrc: `0x${this.actualPeerSsrc.toString(16)}`,
                calculatedJid
            });
        }
        else {
            const peerDeviceJidForSsrc = (0, ssrc_js_1.formatE2ESrtpParticipantId)(acceptingDeviceJid);
            const acceptSsrc = (0, ssrc_js_1.generateSecureSsrc)(callId, peerDeviceJidForSsrc);
            this.peerSsrcs = [acceptSsrc];
            this.logger.debug('accept ssrc assigned', {
                callId,
                jid: peerDeviceJidForSsrc,
                ssrc: `0x${acceptSsrc.toString(16)}`
            });
        }
        this.sctpRelay.setSubscriptionSsrcs(this.peerSsrcs);
        this.sctpRelay.setParticipantPids(this.info.relayData?.selfPid, this.info.relayData?.peerPid);
        this.sctpRelay.resendSubscriptions();
        this.initSrtpKeys();
        const acceptMsgId = node.attrs?.id;
        if (acceptMsgId) {
            try {
                const receiptNode = (0, signaling_js_1.buildAcceptReceiptStanza)(acceptingDeviceJid, acceptMsgId, callId, callCreator, ourJid);
                await this.deps.lowLevelCoordinator.sendNode(receiptNode);
            }
            catch (err) {
                this.logger.error('error sending accept receipt', {
                    message: (0, util_1.toError)(err).message
                });
            }
        }
        if (this.sctpRelay.hasConnection()) {
            try {
                this.info.applyTransition({ type: 'media_connected' });
                this.delegate.emitState(this.info);
                this.startMediaFlow();
            }
            catch (err) {
                this.logger.trace('call transition skipped', { message: (0, util_1.toError)(err).message });
            }
        }
        else if (this.info.relayData) {
            await this.connectRelays(this.info.relayData.endpoints);
        }
    }
    async handleCallPreaccept(node, peerJid) {
        const nodeInfo = (0, signaling_js_1.extractNodeInfo)(node);
        if (!nodeInfo)
            return;
        // Outbound preaccept is only a peer state notification. The caller must keep
        // using the relay selected by the offer ACK; emitting synthetic transport or
        // relaylatency stanzas here can make the handset elect a nonexistent P2P path.
    }
    async handleCallTransport(_node) {
        const nodeInfo = (0, signaling_js_1.extractNodeInfo)(_node);
        if (!nodeInfo)
            return;
        const relays = (0, signaling_js_1.extractRelayEndpoints)(nodeInfo.innerNode);
        if (relays.length > 0 && !this.sctpRelay.hasConnection()) {
            this.info.relayData = {
                ...this.info.relayData,
                endpoints: relays
            };
            await this.connectRelays(relays);
        }
    }
    async handleCallAck(node) {
        const ackType = node.attrs?.type;
        if (ackType !== 'offer')
            return;
        const error = node.attrs?.error;
        if (error) {
            this.logger.error('ack error', { callId: this.info.callId, error });
            return;
        }
        const { relays, participantJids, selfParticipantJid, peerParticipantJid, uuid, selfPid, peerPid, hbhKey } = (0, relay_ack_js_1.parseRelayFromAck)(node);
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
            };
            this.logger.debug('offer ack relays parsed', {
                callId: this.info.callId,
                relayCount: relays.length,
                participantCount: participantJids.length,
                selfParticipantJid,
                peerParticipantJid
            });
            const callKey = this.info.encryptionKey;
            if (participantJids.length > 0) {
                const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
                const meId = this.deps.authClient.getCurrentCredentials()?.meJid;
                const ourCredJid = meLid || meId || '';
                const ourBase = ourCredJid ? (0, protocol_1.toUserJid)(ourCredJid) : '';
                const ourDeviceJid = (0, ssrc_js_1.formatE2ESrtpParticipantId)(participantJids.find((jid) => {
                    const jidBase = (0, protocol_1.toUserJid)(jid);
                    return jidBase === ourBase && /:\d+@/.test(jid);
                }) || ourCredJid);
                const peerJids = participantJids.filter((jid) => {
                    const jidBase = (0, protocol_1.toUserJid)(jid);
                    return jidBase !== ourBase;
                });
                const newSelfSsrc = (0, ssrc_js_1.generateSecureSsrc)(this.info.callId, ourDeviceJid);
                if (newSelfSsrc !== this.selfSsrc) {
                    this.selfSsrc = newSelfSsrc;
                    this.rtpSession = rtp_js_1.RtpSession.whatsappOpus(newSelfSsrc);
                }
                const derivedStreamSsrcs = (0, ssrc_js_1.generateWasmRelayStreamSsrcs)(this.info.callId, ourDeviceJid);
                this.selfStreamSsrcs = (0, ssrc_js_1.prepareWasmRelayStreamSsrcs)(derivedStreamSsrcs, (0, ssrc_js_1.generateSecureSsrc)(this.info.callId, ourDeviceJid, 6));
                if (peerJids.length > 0) {
                    this.peerSsrcs = [
                        ...new Set(peerJids.map((jid) => (0, ssrc_js_1.generateSecureSsrc)(this.info.callId, (0, ssrc_js_1.formatE2ESrtpParticipantId)(jid))))
                    ];
                }
                if (callKey) {
                    this.initSrtpKeys();
                }
                else {
                    this.logger.debug('no call_key, srtp not initialized', {
                        callId: this.info.callId
                    });
                }
            }
            await this.connectRelays(relays);
            if (this.srtpSession &&
                this.rtpSession &&
                this.opusCodec &&
                this.sctpRelay.hasConnection()) {
                this.audioEngine.startSilenceCapture();
            }
        }
    }
    async handleCallRelaylatency(node, peerJid) {
        const nodeInfo = (0, signaling_js_1.extractNodeInfo)(node);
        if (!nodeInfo)
            return;
        const inner = nodeInfo.innerNode;
        const callId = inner.attrs?.['call-id'] || this.info.callId;
        const callCreator = inner.attrs?.['call-creator'] || this.info.callCreator;
        const teNodes = (0, transport_1.getNodeChildrenByTag)(inner, 'te');
        if (teNodes.length === 0)
            return;
        for (const teNode of teNodes) {
            const encodedLatency = Number(teNode.attrs?.latency);
            const latency = Number.isSafeInteger(encodedLatency) && encodedLatency >= 0x02000000
                ? encodedLatency - 0x02000000
                : 0;
            const relayName = teNode.attrs?.relay_name || '';
            if (!relayName)
                continue;
            try {
                const response = (0, signaling_js_1.buildRelayLatencyStanza)(peerJid, callId, callCreator, [{ relayName, latency, addressBytes: teNode.content instanceof Uint8Array ? teNode.content : undefined }], []);
                await this.deps.lowLevelCoordinator.sendNode(response);
            }
            catch (err) {
                this.logger.error('error responding to relaylatency', {
                    relayName,
                    message: (0, util_1.toError)(err).message
                });
                return;
            }
        }
    }
    handleRelayElection(node) {
        const inner = (0, transport_1.getFirstNodeChild)(node);
        if (!inner)
            return;
        let electedRelayIdx;
        if (inner.attrs?.['elected_relay_idx'] !== undefined) {
            const parsed = Number(inner.attrs['elected_relay_idx']);
            if (Number.isSafeInteger(parsed) && parsed >= 0)
                electedRelayIdx = parsed;
        }
        else if (inner.attrs?.['relay_id'] !== undefined) {
            const parsed = Number(inner.attrs['relay_id']);
            if (Number.isSafeInteger(parsed) && parsed >= 0)
                electedRelayIdx = parsed;
        }
        else if (inner.content instanceof Uint8Array) {
            const bytes = inner.content;
            if (bytes.length >= 4)
                electedRelayIdx = (0, bytes_js_1.readUInt32BE)(bytes, 0);
            else if (bytes.length > 0)
                electedRelayIdx = bytes[0];
        }
        if (electedRelayIdx !== undefined) {
            this.info.electedRelayIdx = electedRelayIdx;
            this.logger.debug('elected relay index', {
                callId: this.info.callId,
                electedRelayIdx
            });
        }
    }
    async handleCallMuteV2(node, peerJid) {
        const nodeInfo = (0, signaling_js_1.extractNodeInfo)(node);
        if (!nodeInfo)
            return;
        this.remoteMuteObserved = true;
        if (this.info.direction === types_js_1.CallDirection.Incoming && this.acceptPending) {
            this.acceptedByJid = peerJid;
            await this.sendPendingAccept();
        }
    }
    handleCallTerminate() {
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: types_js_1.EndCallReason.UserEnded
            });
        }
        catch (err) {
            this.logger.trace('call transition skipped', { message: (0, util_1.toError)(err).message });
        }
        this.delegate.emitEnded(this.info);
        this.delegate.emitState(this.info);
        this.cleanup();
    }
    handleCallReject() {
        try {
            this.info.applyTransition({
                type: 'remote_rejected',
                reason: types_js_1.EndCallReason.Declined
            });
        }
        catch (err) {
            this.logger.trace('call transition skipped', { message: (0, util_1.toError)(err).message });
        }
        this.delegate.emitEnded(this.info);
        this.delegate.emitState(this.info);
        this.cleanup();
    }
    handleCallAckError(error) {
        this.logger.error('offer rejected by server', { callId: this.info.callId, error });
        try {
            this.info.applyTransition({
                type: 'terminated',
                reason: types_js_1.EndCallReason.Failed
            });
        }
        catch (err) {
            this.logger.trace('call transition skipped', { message: (0, util_1.toError)(err).message });
        }
        this.delegate.emitEnded(this.info);
        this.delegate.emitState(this.info);
        this.cleanup();
    }
    sendCapturedAudio(data) {
        const hasRelay = this.sctpRelay.hasConnection();
        if (!this.rtpSession || !this.srtpSession || !this.opusCodec || !hasRelay) {
            this.audioDropCount++;
            if (this.audioDropCount === 1 || this.audioDropCount % 500 === 0) {
                const missing = [
                    !this.rtpSession && 'rtpSession',
                    !this.srtpSession && 'srtpSession',
                    !this.opusCodec && 'opusCodec',
                    !hasRelay && 'relayConnection'
                ]
                    .filter(Boolean)
                    .join(', ');
                this.logger.debug('audio dropped', {
                    callId: this.info.callId,
                    dropCount: this.audioDropCount,
                    missing
                });
            }
            return;
        }
        for (let i = 0; i < data.length; i++) {
            if (!Number.isFinite(data[i])) {
                data[i] = 0;
            }
        }
        const frameSamples = this.encodeFrameSamples;
        if (!this.encodeBuffer) {
            if (!this.encodeBufferA) {
                this.encodeBufferA = new Float32Array(frameSamples);
                this.encodeBufferB = new Float32Array(frameSamples);
            }
            this.encodeBuffer = this.encodeBufferA;
            this.encodeBufferPos = 0;
        }
        let offset = 0;
        while (offset < data.length) {
            const toCopy = Math.min(data.length - offset, frameSamples - this.encodeBufferPos);
            this.encodeBuffer.set(data.subarray(offset, offset + toCopy), this.encodeBufferPos);
            this.encodeBufferPos += toCopy;
            offset += toCopy;
            if (this.encodeBufferPos < frameSamples)
                break;
            const frameData = this.encodeBuffer;
            this.encodeBuffer =
                frameData === this.encodeBufferA ? this.encodeBufferB : this.encodeBufferA;
            this.encodeBufferPos = 0;
            try {
                const opusFrame = this.opusCodec.encode(frameData);
                this.sendOpusFrame(opusFrame, false);
                this.realAudioSendCount++;
            }
            catch (err) {
                this.logger.error('encode error', {
                    callId: this.info.callId,
                    message: (0, util_1.toError)(err).message
                });
            }
        }
    }
    cleanup() {
        const opusStats = this.opusCodec?.getStats();
        this.logger.debug('call stats', {
            callId: this.info.callId,
            relayPackets: this.relayPacketCount,
            recvOk: this.audioRecvCount,
            srtpErrors: this.srtpErrorCount,
            sent: this.audioSendCount,
            dropped: this.audioDropCount,
            opusOk: opusStats?.success ?? 0,
            opusErr: opusStats?.errors ?? 0
        });
        this.audioEngine.setOnAudioFinished(null);
        this.audioEngine.stop();
        this.sctpRelay.cleanup();
        if (this.opusCodec) {
            this.opusCodec.destroy();
            this.opusCodec = null;
        }
        this.rtpSession = null;
        this.srtpSession = null;
        this.audioSendCount = 0;
        this.audioDropCount = 0;
        this.audioRecvCount = 0;
        this.srtpErrorCount = 0;
        this.relayPacketCount = 0;
        this.stunResponseCount = 0;
        this.selfEchoCount = 0;
        this.lastRecvSeq = -1;
        this.recvSeqGaps = 0;
        this.actualPeerSsrc = null;
        this.ssrcResubscribed = false;
        this.recvRealCount = 0;
        this.recvDtxCount = 0;
        this.realAudioSendCount = 0;
        this.encodeBuffer = null;
        this.encodeBufferPos = 0;
        this.acceptedByJid = null;
        this.acceptPending = false;
        this.acceptSent = false;
        this.remoteMuteObserved = false;
        this.selfStreamSsrcs = [];
    }
    get encodeFrameSamples() {
        return this.opusCodec?.getFrameSize() ?? 960;
    }
    get rtpTsDelta() {
        return this.encodeFrameSamples;
    }
    sendOpusFrame(opusFrame, isSilence) {
        if (!this.rtpSession || !this.srtpSession)
            return;
        try {
            let rtpPayload = opusFrame;
            const authPadding = types_js_1.SRTP_AUTH_TAG_LEN - types_js_1.SRTP_SEND_AUTH_TAG_LEN;
            if (authPadding > 0) {
                if (!this.authPaddingBuffer || this.authPaddingBuffer.length !== authPadding) {
                    this.authPaddingBuffer = new Uint8Array(authPadding);
                }
                rtpPayload = (0, bytes_js_1.concatBytes)([rtpPayload, this.authPaddingBuffer]);
            }
            const tsDelta = this.rtpTsDelta;
            const rtpPacket = this.rtpSession.createWhatsappOpusPacket(opusFrame, tsDelta, rtpPayload);
            if (this.debeEnabled) {
                rtpPacket.header.extension = true;
                rtpPacket.header.extensionProfile = 0xdebe;
                rtpPacket.header.extensionData = (0, rtp_js_1.isOpusDtxPayload)(opusFrame)
                    ? new Uint8Array([0x30, 0x01, 0x00, 0x00])
                    : WaCallMediaSession.EMPTY_BYTES;
            }
            const srtpData = this.srtpSession.protect(rtpPacket);
            this.sctpRelay.broadcast((0, bytes_js_1.toArrayBuffer)(srtpData));
            this.audioSendCount++;
            if (this.audioSendCount === 1 || this.audioSendCount % 500 === 0) {
                this.logger.debug('audio sent', {
                    callId: this.info.callId,
                    sendCount: this.audioSendCount,
                    opusBytes: opusFrame.length,
                    srtpBytes: srtpData.length,
                    silence: isSilence
                });
            }
        }
        catch (err) {
            this.logger.error('error sending audio', {
                callId: this.info.callId,
                message: (0, util_1.toError)(err).message
            });
        }
    }
    initSrtpKeys() {
        const callKey = this.info.encryptionKey;
        if (!callKey) {
            this.logger.debug('no call_key, srtp not initialized', { callId: this.info.callId });
            return;
        }
        const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
        const meId = this.deps.authClient.getCurrentCredentials()?.meJid;
        const ourCredJid = meLid || meId || '';
        const ourBase = (0, protocol_1.toUserJid)(ourCredJid);
        const participants = this.info.relayData?.participantJids || [];
        const ourDeviceJid = (0, ssrc_js_1.formatE2ESrtpParticipantId)(this.info.relayData?.selfParticipantJid ||
            participants.find((jid) => {
                const jBase = (0, protocol_1.toUserJid)(jid);
                return jBase === ourBase && /:\d+@/.test(jid);
            }) ||
            ourCredJid);
        let rawPeerJid = this.info.relayData?.peerParticipantJid || this.acceptedByJid || this.info.peerJid;
        if (!this.info.relayData?.peerParticipantJid && !this.acceptedByJid) {
            const peerFromParticipants = participants.find((jid) => {
                const jBase = (0, protocol_1.toUserJid)(jid);
                return jBase !== ourBase;
            });
            if (peerFromParticipants)
                rawPeerJid = peerFromParticipants;
        }
        const peerDeviceJid = (0, ssrc_js_1.formatE2ESrtpParticipantId)(rawPeerJid);
        try {
            const sendKeying = (0, encryption_js_1.derivePerJidSrtpKey)(callKey, ourDeviceJid);
            const peerKeyJids = (0, ssrc_js_1.e2eParticipantIdVariants)(peerDeviceJid);
            const receiveKeyings = peerKeyJids.map((jid) => (0, encryption_js_1.derivePerJidSrtpKey)(callKey, jid));
            this.srtpSession = new srtp_js_1.SrtpSession(sendKeying, receiveKeyings[0], types_js_1.SRTP_SEND_AUTH_TAG_LEN, types_js_1.SRTP_RECV_AUTH_TAG_LEN);
            this.srtpSession.setReceiveKeyings(receiveKeyings);
            this.logger.debug('srtp per-jid keys initialized', {
                callId: this.info.callId,
                sendJid: ourDeviceJid,
                recvJids: peerKeyJids
            });
        }
        catch (err) {
            this.logger.debug('srtp key derivation failed', {
                callId: this.info.callId,
                message: (0, util_1.toError)(err).message
            });
        }
    }
    resetEncodeState() {
        this.encodeBuffer = null;
        this.encodeBufferPos = 0;
        this.realAudioSendCount = 0;
    }
    async sendPendingAccept() {
        if (!this.acceptPending || this.acceptSent)
            return;
        const acceptStanza = await (0, signaling_js_1.buildAcceptStanza)(this.info.callId, this.acceptedByJid || this.info.peerJid, this.info.callCreator, this.info.mediaType === types_js_1.CallMediaType.Video);
        try {
            await this.deps.lowLevelCoordinator.sendNode(acceptStanza);
            this.acceptPending = false;
            this.acceptSent = true;
            this.logger.debug('accept sent after caller mute_v2', { callId: this.info.callId });
        }
        catch (err) {
            this.logger.error('accept send error', { message: (0, util_1.toError)(err).message });
        }
    }
    onRelayConnected() {
        if (this.info.stateData.state === types_js_1.CallState.Connecting) {
            try {
                this.info.applyTransition({ type: 'media_connected' });
                this.delegate.emitState(this.info);
                this.startMediaFlow();
                this.logger.debug('relay connected, call active', { callId: this.info.callId });
            }
            catch (err) {
                this.logger.trace('call transition skipped', { message: (0, util_1.toError)(err).message });
            }
            return;
        }
        if (!this.info.isEnded &&
            this.srtpSession &&
            this.rtpSession &&
            this.opusCodec) {
            this.audioEngine.startSilenceCapture();
            this.logger.debug('relay connected, early RTP warmup started', {
                callId: this.info.callId,
                state: this.info.stateData.state
            });
        }
    }
    onRelayData(data) {
        this.relayPacketCount++;
        if ((0, stun_js_1.isStunPacket)(data)) {
            this.stunResponseCount++;
            return;
        }
        if (!(0, stun_js_1.isRtpPacket)(data))
            return;
        const pt = data[1] & 0x7f;
        if (!this.srtpSession || !this.opusCodec)
            return;
        if (!(0, rtp_js_1.isWhatsappOpusPayloadType)(pt))
            return;
        if (data.length >= 12) {
            const ssrc = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0;
            if (ssrc === this.selfSsrc) {
                this.selfEchoCount++;
                return;
            }
            if (!this.ssrcResubscribed && this.actualPeerSsrc === null) {
                this.actualPeerSsrc = ssrc;
                const knownSsrc = this.peerSsrcs.includes(ssrc);
                if (!knownSsrc) {
                    this.peerSsrcs = [ssrc];
                    this.ssrcResubscribed = true;
                    this.sctpRelay.setSubscriptionSsrcs(this.peerSsrcs);
                    this.sctpRelay.resendSubscriptions();
                }
            }
        }
        try {
            const rtpPacket = this.srtpSession.unprotect(data);
            const opusPayload = rtpPacket.payload;
            this.audioRecvCount++;
            if (opusPayload.length === 0)
                return;
            const seq = rtpPacket.header.sequenceNumber;
            if (this.lastRecvSeq >= 0) {
                const expected = (this.lastRecvSeq + 1) & 0xffff;
                if (seq !== expected) {
                    const gap = ((seq - this.lastRecvSeq + 65536) % 65536) - 1;
                    this.recvSeqGaps += gap;
                }
            }
            this.lastRecvSeq = seq;
            const isDtx = (0, rtp_js_1.isOpusDtxPayload)(opusPayload);
            if (isDtx)
                this.recvDtxCount++;
            else
                this.recvRealCount++;
            let audioData = this.opusCodec.decode(opusPayload);
            if (audioData.length > 0 && audioData.length < 960) {
                const padded = new Float32Array(960);
                padded.set(audioData);
                audioData = padded;
            }
            this.audioEngine.onPlaybackData(audioData);
            this.delegate.emitInboundAudio(this.info, audioData);
            if (this.audioRecvCount % 100 === 0) {
                const stats = this.opusCodec.getStats();
                this.logger.debug('audio recv stats', {
                    callId: this.info.callId,
                    recvCount: this.audioRecvCount,
                    real: this.recvRealCount,
                    dtx: this.recvDtxCount,
                    decodeOk: stats.success,
                    decodeErr: stats.errors
                });
            }
        }
        catch (err) {
            this.srtpErrorCount++;
            if (this.srtpErrorCount <= 5) {
                const ssrc = data.length >= 12 ? (0, bytes_js_1.readUInt32BE)(data, 8) : 0;
                this.logger.debug('srtp recv error', {
                    callId: this.info.callId,
                    errorCount: this.srtpErrorCount,
                    message: (0, util_1.toError)(err).message,
                    ssrc: `0x${ssrc.toString(16)}`
                });
            }
        }
    }
    async connectRelays(endpoints) {
        this.logger.debug('connecting relays', {
            callId: this.info.callId,
            endpointCount: endpoints.length
        });
        const selectedEndpoint = (0, relay_endpoints_js_1.selectMediaRelayEndpoint)(endpoints, this.info.direction === types_js_1.CallDirection.Incoming);
        const relays = selectedEndpoint
            ? (0, relay_endpoints_js_1.normalizeRelayEndpoints)([selectedEndpoint], { includeWebTokenFallback: false })
            : [];
        if (relays.length === 0) {
            this.logger.error('no relay configs', { callId: this.info.callId });
            return;
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
        });
        if (this.selfStreamSsrcs.length !== 9) {
            this.logger.error('WASM relay streams not initialized', { callId: this.info.callId });
            return;
        }
        this.sctpRelay.setSsrc(this.selfSsrc);
        this.sctpRelay.setStreamSsrcs(this.selfStreamSsrcs);
        this.sctpRelay.setSubscriptionSsrcs(this.peerSsrcs);
        this.sctpRelay.setParticipantPids(this.info.relayData?.selfPid, this.info.relayData?.peerPid);
        try {
            await this.sctpRelay.configureRelays(relays);
            this.logger.debug('sctp relays configured', {
                callId: this.info.callId,
                connected: this.sctpRelay.getConnectedCount()
            });
        }
        catch (err) {
            this.logger.error('sctp relay error', {
                callId: this.info.callId,
                message: (0, util_1.toError)(err).message
            });
        }
    }
    startMediaFlow() {
        this.resetEncodeState();
        this.audioEngine.startPlayback();
        this.audioEngine.startCapture();
    }
}
exports.WaCallMediaSession = WaCallMediaSession;
