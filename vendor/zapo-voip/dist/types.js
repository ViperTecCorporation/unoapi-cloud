"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WA_DTLS_FINGERPRINT = exports.WA_RELAY_PORT = exports.SRTP_LABEL = exports.SRTP_AUTH_TAG_LEN = exports.SRTP_RECV_AUTH_TAG_LEN = exports.SRTP_SEND_AUTH_TAG_LEN = exports.DEFAULT_AUDIO_CONFIG = exports.PayloadType = exports.EndCallReason = exports.CallMediaType = exports.CallDirection = exports.CallState = void 0;
var CallState;
(function (CallState) {
    CallState["Initiating"] = "initiating";
    CallState["Ringing"] = "ringing";
    CallState["IncomingRinging"] = "incoming_ringing";
    CallState["Connecting"] = "connecting";
    CallState["Active"] = "active";
    CallState["OnHold"] = "on_hold";
    CallState["Ended"] = "ended";
})(CallState || (exports.CallState = CallState = {}));
var CallDirection;
(function (CallDirection) {
    CallDirection["Outgoing"] = "outgoing";
    CallDirection["Incoming"] = "incoming";
})(CallDirection || (exports.CallDirection = CallDirection = {}));
var CallMediaType;
(function (CallMediaType) {
    CallMediaType["Audio"] = "audio";
    CallMediaType["Video"] = "video";
})(CallMediaType || (exports.CallMediaType = CallMediaType = {}));
var EndCallReason;
(function (EndCallReason) {
    EndCallReason["UserEnded"] = "user_ended";
    EndCallReason["Declined"] = "declined";
    EndCallReason["Timeout"] = "timeout";
    EndCallReason["Busy"] = "busy";
    EndCallReason["Cancelled"] = "cancelled";
    EndCallReason["Failed"] = "failed";
    EndCallReason["DoNotDisturb"] = "do_not_disturb";
    EndCallReason["Unknown"] = "unknown";
})(EndCallReason || (exports.EndCallReason = EndCallReason = {}));
var PayloadType;
(function (PayloadType) {
    PayloadType[PayloadType["WhatsAppOpus"] = 120] = "WhatsAppOpus";
})(PayloadType || (exports.PayloadType = PayloadType = {}));
exports.DEFAULT_AUDIO_CONFIG = {
    sampleRate: 16000,
    captureChunkSize: 960,
    playbackOutputSize: 256,
    maxBufferSize: 1600,
    intervalMs: 60
};
exports.SRTP_SEND_AUTH_TAG_LEN = 4;
exports.SRTP_RECV_AUTH_TAG_LEN = 4;
exports.SRTP_AUTH_TAG_LEN = 4;
exports.SRTP_LABEL = {
    ENCRYPTION: 0x00,
    AUTH: 0x01,
    SALT: 0x02
};
exports.WA_RELAY_PORT = 3480;
exports.WA_DTLS_FINGERPRINT = 'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68';
