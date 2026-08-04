"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaSctpRelay = exports.WA_RELAY_DATA_CHANNEL_LABEL = exports.WA_RELAY_DATA_CHANNEL_ID = void 0;
const node_events_1 = require("node:events");
const zapo_js_1 = require("zapo-js");
const util_1 = require("zapo-js/util");
const bytes_js_1 = require("../bytes.js");
const NativeRelayTransport_js_1 = require("./NativeRelayTransport.js");
const stun_js_1 = require("./stun.js");
function closeQuietly(closeable, logger) {
    try {
        closeable?.close();
    }
    catch (err) {
        logger.trace('close failed', { message: (0, util_1.toError)(err).message });
    }
}
const CONFIG = {
    TRUE_WEB_CLIENT_RELAY_PORT: 3480,
    CONNECTION_TIMEOUT: 20000,
    MAX_BUFFER_SIZE: 10 * 1024,
    KEEPALIVE_INTERVAL_MS: 1000
};
exports.WA_RELAY_DATA_CHANNEL_ID = 0;
exports.WA_RELAY_DATA_CHANNEL_LABEL = 'pre-negotiated';
var ConnectionState;
(function (ConnectionState) {
    ConnectionState["None"] = "None";
    ConnectionState["Connecting"] = "Connecting";
    ConnectionState["Open"] = "Open";
    ConnectionState["Closed"] = "Closed";
    ConnectionState["Failed"] = "Failed";
})(ConnectionState || (ConnectionState = {}));
class WaSctpRelay extends node_events_1.EventEmitter {
    logger;
    nativeTransportFactory;
    connections = new Map();
    relayMap = new Map();
    stats = {
        sent: 0,
        received: 0,
        connected: 0
    };
    configuring = false;
    globalBuffer = [];
    globalBufferedBytes = 0;
    keepaliveTimers = new Map();
    audioSsrc = 0;
    subscriptionSsrc = 0;
    subscriptionSsrcs = [];
    streamSsrcs = [];
    selfPid = 0;
    peerPid = 0;
    constructor(options = {}) {
        super();
        this.logger = options.logger ?? (0, zapo_js_1.createNoopLogger)();
        this.nativeTransportFactory =
            options.nativeTransportFactory ?? ((transportOptions) => new NativeRelayTransport_js_1.NativeRelayTransport(transportOptions));
    }
    setSsrc(ssrc) {
        this.audioSsrc = ssrc;
        this.logger.debug('sctp ssrc set', { ssrc: `0x${ssrc.toString(16).padStart(8, '0')}` });
    }
    setSubscriptionSsrc(ssrc) {
        this.setSubscriptionSsrcs(ssrc ? [ssrc] : []);
    }
    setSubscriptionSsrcs(ssrcs) {
        this.subscriptionSsrcs = [
            ...new Set(ssrcs.filter((ssrc) => Number.isSafeInteger(ssrc) && ssrc > 0))
        ];
        this.subscriptionSsrc = this.subscriptionSsrcs[0] ?? 0;
        this.logger.debug('sctp subscription ssrcs set', {
            ssrcs: this.subscriptionSsrcs.map((ssrc) => `0x${ssrc.toString(16).padStart(8, '0')}`)
        });
    }
    setStreamSsrcs(ssrcs) {
        if (ssrcs.length !== 9) {
            throw new Error(`expected 9 WASM relay stream SSRCs, got ${ssrcs.length}`);
        }
        this.streamSsrcs = ssrcs.map((ssrc, index) => {
            if (!Number.isSafeInteger(ssrc) || ssrc <= 0 || ssrc > 0xffffffff) {
                throw new Error(`invalid WASM relay stream SSRC at index ${index}`);
            }
            return ssrc;
        });
        this.logger.debug('sctp WASM relay streams set', {
            ssrcs: this.streamSsrcs.map((ssrc) => `0x${ssrc.toString(16).padStart(8, '0')}`)
        });
    }
    setParticipantPids(selfPid, peerPid) {
        this.selfPid = Number.isSafeInteger(selfPid) && Number(selfPid) >= 0 ? Number(selfPid) : 0;
        this.peerPid = Number.isSafeInteger(peerPid) && Number(peerPid) >= 0 ? Number(peerPid) : 0;
        this.logger.debug('sctp participant pids set', {
            selfPid: this.selfPid,
            peerPid: this.peerPid
        });
    }
    resendSubscriptions() {
        for (const conn of this.connections.values()) {
            if (this.isConnOpen(conn)) {
                this.sendStunAllocateOnOpen(conn, conn.relayInfo);
                this.logger.debug('sctp subscriptions resent', { connectionId: conn.id });
            }
        }
    }
    makeConnectionId(ip, port, authTokenId) {
        const base = ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`;
        return authTokenId ? `${base}#${authTokenId}` : base;
    }
    async connectToRelay(relayInfo) {
        const connectionId = this.makeConnectionId(relayInfo.ip, relayInfo.port, relayInfo.authTokenId);
        this.logger.debug('sctp connecting to relay', {
            connectionId,
            relayName: relayInfo.name
        });
        let conn = this.connections.get(connectionId);
        if (conn && conn.state === ConnectionState.Open) {
            return conn;
        }
        conn = {
            state: ConnectionState.Connecting,
            nativeTransport: null,
            buffer: [],
            bufferedBytes: 0,
            id: connectionId,
            relayInfo,
            connectionTimeout: null,
            hasReceivedFirstPacket: false,
            stableRoutingConnId: 0n,
            cachedAllocate: null,
            stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
        };
        this.connections.set(connectionId, conn);
        conn.connectionTimeout = setTimeout(() => {
            if (conn.state === ConnectionState.Connecting) {
                this.logger.warn('sctp connection timeout', { connectionId });
                this.failConnection(conn, 'connection_timeout');
            }
        }, CONFIG.CONNECTION_TIMEOUT);
        try {
            const transport = this.nativeTransportFactory({
                host: relayInfo.ip,
                port: relayInfo.port,
                logger: this.logger.child({ connectionId, transport: 'native' })
            });
            conn.nativeTransport = transport;
            transport.on('open', () => {
                if (conn.state !== ConnectionState.Connecting)
                    return;
                this.logger.debug('native relay data channel open', { connectionId });
                conn.state = ConnectionState.Open;
                this.stats.connected++;
                if (conn.connectionTimeout) {
                    clearTimeout(conn.connectionTimeout);
                    conn.connectionTimeout = null;
                }
                this.sendStunAllocateOnOpen(conn, relayInfo);
                this.startKeepalive(connectionId, conn);
                this.drainBuffer(connectionId);
                this.emit('relay_connected', { ip: relayInfo.ip, port: relayInfo.port });
            });
            transport.on('message', (buffer) => {
                if (conn.stats.receivedPackets === 0) {
                    this.logger.trace('first message on native relay data channel', {
                        connectionId,
                        size: buffer.length
                    });
                }
                this.handleRelayMessage(buffer, relayInfo, conn);
            });
            transport.on('transport_error', (err) => {
                this.logger.warn('native relay transport error', {
                    connectionId,
                    message: err.message
                });
                this.failConnection(conn, 'native_transport_error');
            });
            this.logger.debug('native relay transport started', {
                connectionId,
                candidate: `${relayInfo.ip}:${relayInfo.port}`
            });
            return conn;
        }
        catch (err) {
            this.logger.error('sctp relay connect failed', {
                connectionId,
                message: (0, util_1.toError)(err).message
            });
            this.failConnection(conn, 'connection_error');
            return null;
        }
    }
    failConnection(conn, reason) {
        if (!conn || conn.state === ConnectionState.Failed)
            return;
        this.logger.warn('sctp connection failed', { connectionId: conn.id, reason });
        conn.state = ConnectionState.Failed;
        this.stopKeepalive(conn.id);
        if (conn.connectionTimeout)
            clearTimeout(conn.connectionTimeout);
        closeQuietly(conn.nativeTransport, this.logger);
        this.connections.delete(conn.id);
    }
    isConnOpen(conn) {
        if (conn.state !== ConnectionState.Open)
            return false;
        return conn.nativeTransport?.isOpen === true;
    }
    findConnectionByIpPort(ip, port) {
        for (const conn of this.connections.values()) {
            if (conn.relayInfo.ip === ip && conn.relayInfo.port === port) {
                return conn;
            }
        }
        return undefined;
    }
    sendStunAllocateOnOpen(conn, relayInfo) {
        const connectionId = `${relayInfo.ip}:${relayInfo.port}`;
        if (!this.isConnOpen(conn))
            return;
        if (!relayInfo.rawToken?.length) {
            this.logger.debug('stun allocate skipped, no binary relay token', { connectionId });
            return;
        }
        if (!relayInfo.key) {
            this.logger.debug('stun allocate skipped, no relay integrity key', { connectionId });
            return;
        }
        if (this.streamSsrcs.length !== 9) {
            this.logger.debug('stun allocate skipped, WASM streams are incomplete', {
                connectionId,
                streamCount: this.streamSsrcs.length
            });
            return;
        }
        if (!conn.cachedAllocate) {
            const streamDescriptors = (0, stun_js_1.buildWasmStreamDescriptors)(this.streamSsrcs);
            conn.cachedAllocate = (0, stun_js_1.buildAllocateForRelay)(relayInfo.rawToken, streamDescriptors, bytes_js_1.TEXT_ENCODER.encode(relayInfo.key), relayInfo.ip, relayInfo.port);
        }
        const allocate = conn.cachedAllocate;
        this.sendToChannel(conn, (0, bytes_js_1.toArrayBuffer)(allocate));
        this.logger.trace('WASM stun allocate sent', {
            connectionId,
            size: allocate.length,
            streamCount: this.streamSsrcs.length
        });
    }
    startKeepalive(connectionId, conn) {
        this.stopKeepalive(connectionId);
        const firstPing = (0, stun_js_1.buildWhatsAppPing)();
        this.sendToChannel(conn, (0, bytes_js_1.toArrayBuffer)(firstPing));
        this.logger.debug('keepalive first ping sent', { connectionId });
        let keepaliveCount = 0;
        const timer = setInterval(() => {
            if (!this.isConnOpen(conn)) {
                this.stopKeepalive(connectionId);
                return;
            }
            this.sendStunAllocateOnOpen(conn, conn.relayInfo);
            const ping = (0, stun_js_1.buildWhatsAppPing)();
            this.sendToChannel(conn, (0, bytes_js_1.toArrayBuffer)(ping));
            keepaliveCount++;
            if (keepaliveCount % 3 === 0) {
                this.logger.debug('sctp relay diagnostics', {
                    connectionId,
                    transport: 'native_dtls_sctp',
                    transportState: conn.nativeTransport?.state ?? 'open',
                    sentPackets: conn.stats.sentPackets,
                    sentBytes: conn.stats.sentBytes,
                    receivedPackets: conn.stats.receivedPackets,
                    receivedBytes: conn.stats.receivedBytes,
                    pongs: this.pongCount,
                    rtpRecv: this.rtpRecvCount,
                    rtcpRecv: this.rtcpRecvCount,
                    keepalives: keepaliveCount,
                    globalSend: this.sendCount
                });
            }
        }, CONFIG.KEEPALIVE_INTERVAL_MS);
        this.keepaliveTimers.set(connectionId, timer);
        this.logger.debug('keepalive started', {
            connectionId,
            intervalMs: CONFIG.KEEPALIVE_INTERVAL_MS
        });
    }
    stopKeepalive(connectionId) {
        const timer = this.keepaliveTimers.get(connectionId);
        if (timer) {
            clearInterval(timer);
            this.keepaliveTimers.delete(connectionId);
        }
    }
    closeConnection(connectionId) {
        const conn = this.connections.get(connectionId);
        if (!conn)
            return;
        conn.state = ConnectionState.Closed;
        this.stopKeepalive(connectionId);
        if (conn.connectionTimeout)
            clearTimeout(conn.connectionTimeout);
        closeQuietly(conn.nativeTransport, this.logger);
        this.stats.connected = Math.max(0, this.stats.connected - 1);
        this.connections.delete(connectionId);
    }
    drainBuffer(connectionId) {
        const conn = this.connections.get(connectionId);
        if (!conn || !this.isConnOpen(conn))
            return;
        while (conn.buffer.length > 0 && this.isConnOpen(conn)) {
            const data = conn.buffer.shift();
            if (data) {
                conn.bufferedBytes -= data.byteLength;
                this.sendToChannel(conn, data);
            }
        }
    }
    sendCount = 0;
    sendToChannel(conn, data) {
        try {
            if (!conn.nativeTransport?.isOpen) {
                return false;
            }
            let arrayBufferToSend;
            if (data.constructor.name === 'SharedArrayBuffer') {
                const uint8 = new Uint8Array(data);
                const copied = new Uint8Array(uint8);
                arrayBufferToSend = copied.buffer;
            }
            else {
                arrayBufferToSend = data;
            }
            if (!conn.nativeTransport.send(new Uint8Array(arrayBufferToSend))) {
                return false;
            }
            conn.stats.sentPackets++;
            conn.stats.sentBytes += data.byteLength;
            this.stats.sent++;
            this.sendCount++;
            if (this.sendCount <= 10 || this.sendCount % 100 === 0) {
                const buf = new Uint8Array(data);
                const firstByte = buf[0] || 0;
                const twoBits = (firstByte & 0xc0) >> 6;
                const pktType = twoBits === 0 ? 'STUN' : twoBits === 2 ? 'RTP/SRTP' : 'OTHER';
                this.logger.trace('sctp relay send', {
                    count: this.sendCount,
                    packetType: pktType,
                    size: data.byteLength,
                    connectionId: conn.id,
                    hexPrefix: (0, util_1.bytesToHex)(buf.subarray(0, 20))
                });
            }
            return true;
        }
        catch (err) {
            this.logger.warn('sctp relay send failed', {
                connectionId: conn.id,
                message: (0, util_1.toError)(err).message
            });
            return false;
        }
    }
    pongCount = 0;
    rtpRecvCount = 0;
    rtcpRecvCount = 0;
    unknownRecvCount = 0;
    handleRelayMessage(data, relayInfo, conn) {
        conn.stats.receivedPackets++;
        conn.stats.receivedBytes += data.length;
        this.stats.received++;
        const firstByte = data[0];
        const twoBits = (firstByte & 0xc0) >> 6;
        const isRtcp = data.length >= 2 && twoBits === 2 && data[1] >= 192 && data[1] <= 223;
        const isRtp = (0, stun_js_1.isRtpPacket)(data);
        const hexPreview = (0, util_1.bytesToHex)(data.subarray(0, Math.min(24, data.length)));
        const pktType = twoBits === 0
            ? 'STUN'
            : isRtcp
                ? 'RTCP/SRTCP'
                : isRtp
                    ? 'RTP/SRTP'
                    : twoBits === 1
                        ? 'DTLS'
                        : 'UNKNOWN';
        if (!conn.hasReceivedFirstPacket) {
            conn.hasReceivedFirstPacket = true;
            this.logger.trace('first packet received from relay', { connectionId: conn.id });
        }
        const shouldLog = conn.stats.receivedPackets <= 50 ||
            conn.stats.receivedPackets % 25 === 0 ||
            isRtp ||
            isRtcp ||
            (twoBits === 0 && data.length >= 20 && !this.isPong(data));
        if (shouldLog) {
            this.logger.trace('sctp relay receive', {
                count: conn.stats.receivedPackets,
                packetType: pktType,
                size: data.length,
                connectionId: conn.id,
                hexPreview
            });
        }
        if (twoBits === 0) {
            const stunInfo = (0, stun_js_1.parseStunResponse)(data);
            if (stunInfo) {
                if (stunInfo.rawType === 0x0001 && relayInfo.key) {
                    const bindingSuccess = (0, stun_js_1.buildBindingSuccessForRequest)(data, bytes_js_1.TEXT_ENCODER.encode(relayInfo.key));
                    if (bindingSuccess && this.sendToChannel(conn, (0, bytes_js_1.toArrayBuffer)(bindingSuccess))) {
                        this.logger.debug('relay binding request answered', {
                            connectionId: conn.id,
                            transactionId: stunInfo.transactionId,
                            responseBytes: bindingSuccess.length
                        });
                    }
                }
                if (stunInfo.method === 'wa-pong') {
                    this.pongCount++;
                    if (this.pongCount <= 3 || this.pongCount % 20 === 0) {
                        this.logger.trace('stun pong received', {
                            count: this.pongCount,
                            connectionId: conn.id,
                            size: data.length
                        });
                    }
                }
                else {
                    this.logger.trace('stun response received', {
                        connectionId: conn.id,
                        summary: (0, stun_js_1.formatStunResponse)(stunInfo),
                        hex: (0, util_1.bytesToHex)(data)
                    });
                    if (stunInfo.isSuccess &&
                        (stunInfo.method === 'binding' || stunInfo.method === 'allocate')) {
                        this.logger.debug('stun binding or allocate success', {
                            connectionId: conn.id,
                            method: stunInfo.method
                        });
                    }
                    if (stunInfo.stableRoutingConnId && conn.stableRoutingConnId === 0n) {
                        conn.stableRoutingConnId = stunInfo.stableRoutingConnId;
                        this.logger.debug('stun stable routing latched', {
                            connectionId: conn.id,
                            connId: `0x${stunInfo.stableRoutingConnId.toString(16)}`
                        });
                    }
                    if (stunInfo.isError) {
                        this.logger.warn('stun error response', {
                            connectionId: conn.id,
                            errorCode: stunInfo.errorCode,
                            errorReason: stunInfo.errorReason || ''
                        });
                    }
                    for (const attr of stunInfo.attributes) {
                        this.logger.trace('stun attribute', {
                            connectionId: conn.id,
                            typeName: attr.typeName,
                            type: `0x${attr.type.toString(16)}`,
                            length: attr.length,
                            data: (0, util_1.bytesToHex)(attr.data.subarray(0, Math.min(32, attr.data.length)))
                        });
                    }
                }
            }
            else {
                this.logger.trace('unparseable stun-like packet', {
                    connectionId: conn.id,
                    size: data.length,
                    hex: (0, util_1.bytesToHex)(data.subarray(0, 80))
                });
            }
        }
        if (isRtp) {
            this.rtpRecvCount++;
            const pt = data[1] & 0x7f;
            const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0;
            const ssrc = data.length >= 12 ? (0, bytes_js_1.readUInt32BE)(data, 8) : 0;
            this.logger.trace('rtp packet received', {
                count: this.rtpRecvCount,
                payloadType: pt,
                sequence: seq,
                ssrc: `0x${ssrc.toString(16)}`,
                size: data.length,
                connectionId: conn.id
            });
            if (this.rtpRecvCount <= 3) {
                this.logger.trace('rtp packet hex preview', {
                    connectionId: conn.id,
                    hex: (0, util_1.bytesToHex)(data.subarray(0, 160))
                });
            }
        }
        if (isRtcp) {
            this.rtcpRecvCount++;
            if (this.rtcpRecvCount <= 3 || this.rtcpRecvCount % 20 === 0) {
                this.logger.trace('rtcp packet received', {
                    count: this.rtcpRecvCount,
                    payloadType: data[1],
                    size: data.length,
                    connectionId: conn.id
                });
            }
        }
        if (twoBits !== 0 && !isRtp && !isRtcp) {
            this.unknownRecvCount++;
            this.logger.trace('unknown relay packet type', {
                count: this.unknownRecvCount,
                firstByte: `0x${firstByte.toString(16)}`,
                size: data.length,
                connectionId: conn.id,
                hex: (0, util_1.bytesToHex)(data.subarray(0, 80))
            });
        }
        this.emit('relay_receive', {
            ip: relayInfo.ip,
            port: relayInfo.port,
            data
        });
    }
    isPong(data) {
        if (data.length < 2)
            return false;
        const msgType = (data[0] << 8) | data[1];
        return msgType === 0x0802;
    }
    async configureRelays(relays) {
        this.logger.debug('sctp configuring relays', { count: relays.length });
        this.configuring = true;
        for (const relay of relays) {
            const port = relay.port || CONFIG.TRUE_WEB_CLIENT_RELAY_PORT;
            const connectionId = this.makeConnectionId(relay.ip, port, relay.authTokenId);
            const relayInfo = {
                id: connectionId,
                ip: relay.ip,
                port,
                token: relay.token,
                authToken: relay.authToken,
                rawAuthToken: relay.rawAuthToken,
                rawToken: relay.rawToken,
                key: relay.key,
                relayId: relay.relayId,
                name: relay.name || 'unknown',
                authTokenId: relay.authTokenId,
                isFna: relay.isFna
            };
            this.relayMap.set(connectionId, relayInfo);
        }
        this.logger.debug('sctp relays registered', { count: this.relayMap.size });
        const connectionPromises = [];
        for (const [, relayInfo] of this.relayMap) {
            const connId = this.makeConnectionId(relayInfo.ip, relayInfo.port, relayInfo.authTokenId);
            if (!this.connections.has(connId)) {
                connectionPromises.push(this.connectToRelay(relayInfo));
            }
        }
        await Promise.all(connectionPromises);
        this.logger.debug('sctp relay configuration done', { connected: this.stats.connected });
        this.configuring = false;
        if (this.globalBuffer.length > 0) {
            for (const item of this.globalBuffer) {
                this.sendToRelay(item.ip, item.port, item.data);
            }
            this.globalBuffer = [];
            this.globalBufferedBytes = 0;
        }
    }
    sendToRelay(ip, port, data) {
        if (this.configuring) {
            while (this.globalBufferedBytes + data.byteLength > CONFIG.MAX_BUFFER_SIZE &&
                this.globalBuffer.length > 0) {
                const oldest = this.globalBuffer.shift();
                if (oldest)
                    this.globalBufferedBytes -= oldest.data.byteLength;
            }
            this.globalBuffer.push({ ip, port, data });
            this.globalBufferedBytes += data.byteLength;
            return true;
        }
        const conn = this.findConnectionByIpPort(ip, port);
        if (!conn) {
            return false;
        }
        if (this.isConnOpen(conn)) {
            if (conn.buffer.length > 0) {
                this.bufferData(conn, data);
                this.drainBuffer(conn.id);
            }
            else {
                return this.sendToChannel(conn, data);
            }
            return true;
        }
        else if (conn.state === ConnectionState.Connecting) {
            this.bufferData(conn, data);
            return true;
        }
        return false;
    }
    bufferData(conn, data) {
        while (conn.bufferedBytes + data.byteLength > CONFIG.MAX_BUFFER_SIZE &&
            conn.buffer.length > 0) {
            const oldest = conn.buffer.shift();
            if (oldest)
                conn.bufferedBytes -= oldest.byteLength;
        }
        conn.buffer.push(data);
        conn.bufferedBytes += data.byteLength;
    }
    broadcast(data) {
        for (const conn of this.connections.values()) {
            if (this.isConnOpen(conn)) {
                this.sendToChannel(conn, data);
            }
        }
    }
    hasConnection() {
        for (const conn of this.connections.values()) {
            if (conn.state === ConnectionState.Open)
                return true;
        }
        return false;
    }
    getConnectedCount() {
        return this.stats.connected;
    }
    cleanup() {
        this.logger.debug('sctp cleaning up connections', { count: this.connections.size });
        for (const [id] of this.keepaliveTimers) {
            this.stopKeepalive(id);
        }
        for (const [, conn] of this.connections) {
            if (conn.connectionTimeout)
                clearTimeout(conn.connectionTimeout);
            closeQuietly(conn.nativeTransport, this.logger);
        }
        this.connections.clear();
        this.relayMap.clear();
        this.globalBuffer = [];
        this.globalBufferedBytes = 0;
        this.configuring = false;
        this.stats.connected = 0;
        this.audioSsrc = 0;
        this.subscriptionSsrc = 0;
        this.pongCount = 0;
        this.rtpRecvCount = 0;
        this.rtcpRecvCount = 0;
        this.unknownRecvCount = 0;
        this.sendCount = 0;
        this.logger.debug('sctp all connections cleaned');
    }
}
exports.WaSctpRelay = WaSctpRelay;
