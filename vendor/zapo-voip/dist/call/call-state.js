"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidTransition = exports.CallInfo = void 0;
const types_js_1 = require("../types.js");
class CallInfo {
    constructor(init) {
        this.callId = init.callId;
        this.peerJid = init.peerJid;
        this.callCreator = init.callCreator;
        this.direction = init.direction;
        this.mediaType = init.mediaType;
        this.stateData = init.stateData;
        this.createdAt = init.createdAt ?? new Date();
        this.groupJid = init.groupJid;
        this.isOffline = init.isOffline ?? false;
        this.callerPn = init.callerPn;
        this.encryptionKey = init.encryptionKey;
        this.relayData = init.relayData;
        this.electedRelayIdx = init.electedRelayIdx;
    }
    static newOutgoing(callId, peerJid, ourJid, mediaType) {
        return new CallInfo({
            callId,
            peerJid,
            callCreator: ourJid,
            direction: types_js_1.CallDirection.Outgoing,
            mediaType,
            stateData: {
                state: types_js_1.CallState.Initiating,
                audioMuted: false,
                videoOff: mediaType !== types_js_1.CallMediaType.Video
            }
        });
    }
    static newIncoming(callId, peerJid, callCreator, callerPn, mediaType) {
        return new CallInfo({
            callId,
            peerJid,
            callCreator,
            direction: types_js_1.CallDirection.Incoming,
            mediaType,
            callerPn,
            stateData: {
                state: types_js_1.CallState.IncomingRinging,
                audioMuted: false,
                videoOff: mediaType !== types_js_1.CallMediaType.Video
            }
        });
    }
    get isInitiator() {
        return this.direction === types_js_1.CallDirection.Outgoing;
    }
    get isActive() {
        return this.stateData.state === types_js_1.CallState.Active;
    }
    get isRinging() {
        return (this.stateData.state === types_js_1.CallState.Ringing ||
            this.stateData.state === types_js_1.CallState.IncomingRinging);
    }
    get isEnded() {
        return this.stateData.state === types_js_1.CallState.Ended;
    }
    get canAccept() {
        return this.stateData.state === types_js_1.CallState.IncomingRinging && !this.stateData.acceptBlocked;
    }
    get isAcceptBlocked() {
        return this.stateData.acceptBlocked === true;
    }
    get canReject() {
        return (this.stateData.state === types_js_1.CallState.IncomingRinging ||
            this.stateData.state === types_js_1.CallState.Ringing);
    }
    applyTransition(transition) {
        const s = this.stateData;
        switch (transition.type) {
            case 'offer_sent':
                if (s.state !== types_js_1.CallState.Initiating) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Ringing;
                break;
            case 'offer_received':
                if (s.state !== types_js_1.CallState.Initiating) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.IncomingRinging;
                s.silenced = transition.silenced;
                break;
            case 'remote_accepted':
                if (s.state !== types_js_1.CallState.Ringing) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Connecting;
                s.acceptedAt = new Date();
                break;
            case 'local_accepted':
                if (s.state !== types_js_1.CallState.IncomingRinging) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Connecting;
                s.acceptedAt = new Date();
                break;
            case 'remote_rejected':
                if (s.state !== types_js_1.CallState.Ringing) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Ended;
                s.endedAt = new Date();
                s.endReason = transition.reason;
                break;
            case 'local_rejected':
                if (s.state !== types_js_1.CallState.IncomingRinging) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Ended;
                s.endedAt = new Date();
                s.endReason = transition.reason;
                break;
            case 'media_connected':
                if (s.state !== types_js_1.CallState.Connecting) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Active;
                s.connectedAt = new Date();
                s.videoOff = this.mediaType !== types_js_1.CallMediaType.Video;
                break;
            case 'terminated':
                if (s.state === types_js_1.CallState.Ended) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                if (s.state === types_js_1.CallState.Active && s.connectedAt) {
                    s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000);
                }
                else if (s.state === types_js_1.CallState.OnHold && s.connectedAt) {
                    s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000);
                }
                s.state = types_js_1.CallState.Ended;
                s.endedAt = new Date();
                s.endReason = transition.reason;
                break;
            case 'hold':
                if (s.state !== types_js_1.CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.OnHold;
                break;
            case 'resume':
                if (s.state !== types_js_1.CallState.OnHold) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.state = types_js_1.CallState.Active;
                break;
            case 'audio_mute_changed':
                if (s.state !== types_js_1.CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.audioMuted = transition.muted;
                break;
            case 'video_state_changed':
                if (s.state !== types_js_1.CallState.Active) {
                    throw new InvalidTransition(s.state, transition.type);
                }
                s.videoOff = transition.off;
                break;
            default:
                throw new InvalidTransition(s.state, transition.type);
        }
    }
}
exports.CallInfo = CallInfo;
class InvalidTransition extends Error {
    constructor(currentState, attempted) {
        super(`invalid transition '${attempted}' in state '${currentState}'`);
        this.name = 'InvalidTransition';
        this.currentState = currentState;
        this.attempted = attempted;
    }
}
exports.InvalidTransition = InvalidTransition;
