import { EventEmitter } from 'node:events';
import { createNoopLogger } from 'zapo-js';
import { bytesToHex, toError } from 'zapo-js/util';
import { readUInt32BE, TEXT_ENCODER, toArrayBuffer } from '../bytes.js';
import { NativeRelayTransport } from './NativeRelayTransport.js';
import { buildAllocateForRelay, buildBindingSuccessForRequest, buildWasmStreamDescriptors, buildWhatsAppPing, formatStunResponse, isRtpPacket, parseStunResponse } from './stun.js';
function closeQuietly(closeable, logger) {
    try {
        closeable?.close();
    }
    catch (err) {
        logger.trace('close failed', { message: toError(err).message });
    }
}
const CONFIG = {
    TRUE_WEB_CLIENT_RELAY_PORT: 3480,
    CONNECTION_TIMEOUT: 20000,
    MAX_BUFFER_SIZE: 10 * 1024,
    KEEPALIVE_INTERVAL_MS: 1000
};
export const WA_RELAY_DATA_CHANNEL_ID = 0;
export const WA_RELAY_DATA_CHANNEL_LABEL = 'pre-negotiated';
var ConnectionState;
(function (ConnectionState) {
    ConnectionState["None"] = "None";
    ConnectionState["Connecting"] = "Connecting";
    ConnectionState["Open"] = "Open";
    ConnectionState["Closed"] = "Closed";
    ConnectionState["Failed"] = "Failed";
})(ConnectionState || (ConnectionState = {}));
export class WaSctpRelay extends EventEmitter {
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
    readyConnectionIds = new Set();
    mediaConnectionId = null;
    mediaConnectionConfirmed = false;
    mediaPendingSelectionDropCount = 0;
    startupMediaFanoutEnabled = false;
    startupMediaFanoutLogCount = 0;
    constructor(options = {}) {
        super();
        this.logger = options.logger ?? createNoopLogger();
        this.nativeTransportFactory =
            options.nativeTransportFactory ?? ((transportOptions) => new NativeRelayTransport(transportOptions));
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
    setStartupMediaFanout(enabled) {
        this.startupMediaFanoutEnabled = enabled;
        this.startupMediaFanoutLogCount = 0;
        this.logger.debug('sctp startup media fanout changed', { enabled });
    }
    hasReadyConnection() {
        return this.getReadyConnectionCount() > 0;
    }
    getReadyConnectionCount() {
        let count = 0;
        for (const connectionId of this.readyConnectionIds) {
            const conn = this.connections.get(connectionId);
            if (conn && this.isConnOpen(conn))
                count++;
        }
        return count;
    }
    getConfiguredRelayCount() {
        return this.relayMap.size;
    }
    getReceiveStats() {
        return {
            rtp: this.remoteRtpRecvCount,
            rtcp: this.remoteRtcpRecvCount,
            pongs: this.pongCount,
            received: this.stats.received,
            readyConnections: this.getReadyConnectionCount(),
            lastControlResponseAt: this.lastControlResponseAt
        };
    }
    selectMediaConnection(connectionId, confirmed = false) {
        const conn = this.connections.get(connectionId);
        if (!conn || !this.isConnOpen(conn))
            return false;
        if (this.mediaConnectionConfirmed && this.mediaConnectionId !== connectionId)
            return false;
        if (this.mediaConnectionId === connectionId) {
            if (confirmed) {
                this.mediaConnectionConfirmed = true;
                this.startupMediaFanoutEnabled = false;
            }
            return true;
        }
        this.mediaConnectionId = connectionId;
        this.mediaConnectionConfirmed = confirmed;
        if (confirmed)
            this.startupMediaFanoutEnabled = false;
        this.logger.debug('relay media path selected', {
            connectionId: conn.id,
            relayName: conn.relayInfo.name,
            ip: conn.relayInfo.ip,
            port: conn.relayInfo.port,
            tokenId: conn.relayInfo.tokenId,
            confirmed
        });
        return true;
    }
    selectMediaConnectionByRelayId(relayId) {
        if (!Number.isSafeInteger(relayId) || relayId < 0)
            return false;
        for (const conn of this.connections.values()) {
            if (conn.relayInfo.relayId === relayId && this.isConnOpen(conn)) {
                return this.selectMediaConnection(conn.id, false);
            }
        }
        return false;
    }
    waitForReadyCount(minimumCount = 1, timeoutMs = 2000) {
        const requiredCount = Math.max(0, Math.floor(minimumCount));
        const currentCount = this.getReadyConnectionCount();
        if (requiredCount === 0 || currentCount >= requiredCount) {
            return Promise.resolve(currentCount);
        }
        return new Promise((resolve) => {
            let settled = false;
            const finish = (count) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                this.off('relay_ready', onReady);
                this.off('relay_cleanup', onCleanup);
                resolve(count);
            };
            const onReady = () => {
                const readyCount = this.getReadyConnectionCount();
                if (readyCount >= requiredCount)
                    finish(readyCount);
            };
            const onCleanup = () => finish(0);
            const timer = setTimeout(() => finish(this.getReadyConnectionCount()), timeoutMs);
            this.on('relay_ready', onReady);
            this.on('relay_cleanup', onCleanup);
        });
    }
    async waitForReady(timeoutMs = 2000) {
        return (await this.waitForReadyCount(1, timeoutMs)) > 0;
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
                if (this.connections.get(connectionId) !== conn ||
                    conn.state !== ConnectionState.Connecting) {
                    return;
                }
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
                if (this.connections.get(connectionId) !== conn ||
                    !this.isConnOpen(conn)) {
                    return;
                }
                if (conn.stats.receivedPackets === 0) {
                    this.logger.trace('first message on native relay data channel', {
                        connectionId,
                        size: buffer.length
                    });
                }
                this.handleRelayMessage(buffer, relayInfo, conn);
            });
            transport.on('transport_error', (err) => {
                if (this.connections.get(connectionId) !== conn)
                    return;
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
                message: toError(err).message
            });
            this.failConnection(conn, 'connection_error');
            return null;
        }
    }
    failConnection(conn, reason) {
        if (!conn || conn.state === ConnectionState.Failed)
            return;
        this.logger.warn('sctp connection failed', { connectionId: conn.id, reason });
        const wasConnected = conn.state === ConnectionState.Open;
        conn.state = ConnectionState.Failed;
        this.stopKeepalive(conn.id);
        if (conn.connectionTimeout)
            clearTimeout(conn.connectionTimeout);
        closeQuietly(conn.nativeTransport, this.logger);
        this.readyConnectionIds.delete(conn.id);
        if (this.mediaConnectionId === conn.id) {
            this.mediaConnectionId = null;
            this.mediaConnectionConfirmed = false;
        }
        this.connections.delete(conn.id);
        if (wasConnected) {
            this.stats.connected = Math.max(0, this.stats.connected - 1);
        }
        this.emit('relay_failed', {
            connectionId: conn.id,
            relayId: conn.relayInfo.relayId,
            relayName: conn.relayInfo.name,
            ip: conn.relayInfo.ip,
            port: conn.relayInfo.port,
            reason
        });
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
            const streamDescriptors = buildWasmStreamDescriptors(this.streamSsrcs);
            conn.cachedAllocate = buildAllocateForRelay(relayInfo.rawToken, streamDescriptors, TEXT_ENCODER.encode(relayInfo.key), relayInfo.ip, relayInfo.port);
        }
        const allocate = conn.cachedAllocate;
        this.sendToChannel(conn, toArrayBuffer(allocate));
        this.logger.debug('voip_diag relay_allocate_sent', {
            connectionId,
            size: allocate.length,
            streamSsrcs: this.streamSsrcs.map((ssrc) => `0x${ssrc.toString(16).padStart(8, '0')}`),
            subscriptionSsrcs: this.subscriptionSsrcs.map((ssrc) => `0x${ssrc.toString(16).padStart(8, '0')}`),
            selfPid: this.selfPid,
            peerPid: this.peerPid,
            tokenId: relayInfo.tokenId,
            authTokenId: relayInfo.authTokenId,
            tokenBytes: relayInfo.rawToken.length,
            keyBytes: TEXT_ENCODER.encode(relayInfo.key).length
        });
        this.logger.trace('WASM stun allocate sent', {
            connectionId,
            size: allocate.length,
            streamCount: this.streamSsrcs.length,
            subscriptionCount: this.subscriptionSsrcs.length,
            tokenId: relayInfo.tokenId,
            authTokenId: relayInfo.authTokenId,
            tokenBytes: relayInfo.rawToken.length,
            keyBytes: TEXT_ENCODER.encode(relayInfo.key).length
        });
    }
    startKeepalive(connectionId, conn) {
        this.stopKeepalive(connectionId);
        const firstPing = buildWhatsAppPing();
        this.sendToChannel(conn, toArrayBuffer(firstPing));
        this.logger.debug('keepalive first ping sent', { connectionId });
        let keepaliveCount = 0;
        const timer = setInterval(() => {
            if (!this.isConnOpen(conn)) {
                this.stopKeepalive(connectionId);
                return;
            }
            this.sendStunAllocateOnOpen(conn, conn.relayInfo);
            const ping = buildWhatsAppPing();
            this.sendToChannel(conn, toArrayBuffer(ping));
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
        this.readyConnectionIds.delete(connectionId);
        if (this.mediaConnectionId === connectionId) {
            this.mediaConnectionId = null;
            this.mediaConnectionConfirmed = false;
        }
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
                    hexPrefix: bytesToHex(buf.subarray(0, 20))
                });
            }
            return true;
        }
        catch (err) {
            this.logger.warn('sctp relay send failed', {
                connectionId: conn.id,
                message: toError(err).message
            });
            return false;
        }
    }
    pongCount = 0;
    rtpRecvCount = 0;
    rtcpRecvCount = 0;
    remoteRtpRecvCount = 0;
    remoteRtcpRecvCount = 0;
    unknownRecvCount = 0;
    lastControlResponseAt = 0;
    handleRelayMessage(data, relayInfo, conn) {
        conn.stats.receivedPackets++;
        conn.stats.receivedBytes += data.length;
        this.stats.received++;
        const firstByte = data[0];
        const twoBits = (firstByte & 0xc0) >> 6;
        const isRtcp = data.length >= 2 && twoBits === 2 && data[1] >= 192 && data[1] <= 223;
        const isRtp = isRtpPacket(data);
        const hexPreview = bytesToHex(data.subarray(0, Math.min(24, data.length)));
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
            const stunInfo = parseStunResponse(data);
            if (stunInfo) {
                this.lastControlResponseAt = Date.now();
                if (stunInfo.rawType === 0x0001 && relayInfo.key) {
                    const bindingSuccess = buildBindingSuccessForRequest(data, TEXT_ENCODER.encode(relayInfo.key));
                    if (bindingSuccess && this.sendToChannel(conn, toArrayBuffer(bindingSuccess))) {
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
                        summary: formatStunResponse(stunInfo),
                        hex: bytesToHex(data)
                    });
                    if (stunInfo.isSuccess &&
                        (stunInfo.method === 'binding' || stunInfo.method === 'allocate')) {
                        this.logger.debug('stun binding or allocate success', {
                            connectionId: conn.id,
                            method: stunInfo.method
                        });
                        if (stunInfo.method === 'allocate' &&
                            !this.readyConnectionIds.has(conn.id)) {
                            this.readyConnectionIds.add(conn.id);
                            this.emit('relay_ready', {
                                ip: relayInfo.ip,
                                port: relayInfo.port,
                                connectionId: conn.id
                            });
                        }
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
                            data: bytesToHex(attr.data.subarray(0, Math.min(32, attr.data.length)))
                        });
                    }
                }
            }
            else {
                this.logger.trace('unparseable stun-like packet', {
                    connectionId: conn.id,
                    size: data.length,
                    hex: bytesToHex(data.subarray(0, 80))
                });
            }
        }
        if (isRtp) {
            this.rtpRecvCount++;
            const pt = data[1] & 0x7f;
            const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0;
            const ssrc = data.length >= 12 ? readUInt32BE(data, 8) : 0;
            if (!this.audioSsrc || ssrc !== this.audioSsrc) {
                this.remoteRtpRecvCount++;
            }
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
                    hex: bytesToHex(data.subarray(0, 160))
                });
            }
        }
        if (isRtcp) {
            this.rtcpRecvCount++;
            const ssrc = data.length >= 8 ? readUInt32BE(data, 4) : 0;
            if (!this.audioSsrc || ssrc !== this.audioSsrc) {
                this.remoteRtcpRecvCount++;
            }
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
                hex: bytesToHex(data.subarray(0, 80))
            });
        }
        this.emit('relay_receive', {
            ip: relayInfo.ip,
            port: relayInfo.port,
            connectionId: conn.id,
            relayId: relayInfo.relayId,
            tokenId: relayInfo.tokenId,
            authTokenId: relayInfo.authTokenId,
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
                tokenId: relay.tokenId,
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
        const bytes = new Uint8Array(data);
        const isMedia = bytes.length > 0 && ((bytes[0] & 0xc0) >> 6) === 2;
        if (isMedia) {
            if (this.mediaConnectionConfirmed && this.mediaConnectionId) {
                const selected = this.connections.get(this.mediaConnectionId);
                if (selected && this.isConnOpen(selected)) {
                    this.sendToChannel(selected, data);
                    return;
                }
                this.mediaConnectionId = null;
                this.mediaConnectionConfirmed = false;
            }
            // The official Zapo transport publishes the same protected RTP on
            // every advertised relay. For a direct incoming call we need that
            // behavior only during startup: the caller may have selected a
            // different live relay than our provisional candidate and will not
            // publish remote media until it receives RTP on that path. The
            // first authenticated remote packet confirms one connection and
            // returns egress to a single relay.
            if (this.startupMediaFanoutEnabled && !this.mediaConnectionConfirmed) {
                let sent = 0;
                for (const conn of this.connections.values()) {
                    if (!this.isConnOpen(conn))
                        continue;
                    this.sendToChannel(conn, data);
                    sent++;
                }
                if (sent > 0) {
                    this.startupMediaFanoutLogCount++;
                    if (this.startupMediaFanoutLogCount === 1 ||
                        this.startupMediaFanoutLogCount % 250 === 0) {
                        this.logger.debug('startup media fanned out across relays', {
                            sent,
                            configured: this.relayMap.size,
                            connected: this.getConnectedCount()
                        });
                    }
                    return;
                }
            }
            if (this.mediaConnectionId) {
                const selected = this.connections.get(this.mediaConnectionId);
                if (selected && this.isConnOpen(selected)) {
                    this.sendToChannel(selected, data);
                    return;
                }
                this.mediaConnectionId = null;
            }
            // Outside inbound startup, wait a few milliseconds for the
            // provisional relay to open instead of duplicating media.
            if (this.relayMap.size > 1) {
                this.mediaPendingSelectionDropCount++;
                if (this.mediaPendingSelectionDropCount === 1 ||
                    this.mediaPendingSelectionDropCount % 250 === 0) {
                    this.logger.debug('media waiting for relay selection', {
                        dropped: this.mediaPendingSelectionDropCount,
                        configured: this.relayMap.size,
                        connected: this.getConnectedCount()
                    });
                }
                return;
            }
        }
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
    /**
     * Closes only the native relay transport state. Media identities and the
     * current SRTP/codec session are deliberately preserved so a caller can
     * configure the next advertised candidate without rebuilding the call.
     */
    resetTransport(reason = 'relay_reconfigure') {
        this.logger.debug('sctp resetting transport', {
            reason,
            connections: this.connections.size,
            configured: this.relayMap.size
        });
        for (const [id] of this.keepaliveTimers) {
            this.stopKeepalive(id);
        }
        for (const [, conn] of this.connections) {
            if (conn.connectionTimeout)
                clearTimeout(conn.connectionTimeout);
            conn.state = ConnectionState.Closed;
            closeQuietly(conn.nativeTransport, this.logger);
        }
        this.emit('relay_cleanup', { reason, transportOnly: true });
        this.readyConnectionIds.clear();
        this.mediaConnectionId = null;
        this.mediaConnectionConfirmed = false;
        this.mediaPendingSelectionDropCount = 0;
        this.startupMediaFanoutEnabled = false;
        this.startupMediaFanoutLogCount = 0;
        this.connections.clear();
        this.relayMap.clear();
        this.globalBuffer = [];
        this.globalBufferedBytes = 0;
        this.configuring = false;
        this.stats = { sent: 0, received: 0, connected: 0 };
        this.pongCount = 0;
        this.rtpRecvCount = 0;
        this.rtcpRecvCount = 0;
        this.remoteRtpRecvCount = 0;
        this.remoteRtcpRecvCount = 0;
        this.unknownRecvCount = 0;
        this.lastControlResponseAt = 0;
        this.sendCount = 0;
    }
    cleanup() {
        this.logger.debug('sctp cleaning up connections', { count: this.connections.size });
        this.resetTransport('call_cleanup');
        this.audioSsrc = 0;
        this.subscriptionSsrc = 0;
        this.subscriptionSsrcs = [];
        this.streamSsrcs = [];
        this.selfPid = 0;
        this.peerPid = 0;
        this.logger.debug('sctp all connections cleaned');
    }
}
