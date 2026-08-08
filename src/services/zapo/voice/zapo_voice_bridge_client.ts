import WebSocket from 'ws'
import logger from '../../logger'
import { decodeVoipBridgeAudioFrame, encodeVoipBridgeAudioFrame, encodeVoipBridgeControl, parseVoipBridgeControl } from './zapo_voice_bridge_codec'
import type { VoipBridgeCallCommand, VoipBridgeControlMessage } from './zapo_voice_types'
import { confirmedZapoVoicePhone, type ZapoVoiceCallerIdentity } from './zapo_voice_caller_identity'
import { VOIP_BRIDGE_AUDIO_SAMPLE_RATE, VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME } from './zapo_voice_types'
import type { ZapoVoiceAdapter } from './zapo_voice_adapter'

type WebSocketFactory = (url: string, options: WebSocket.ClientOptions) => WebSocket

export const resolveZapoVoiceBridgeUrl = (serviceUrl: string, explicitUrl = '') => {
  if (explicitUrl.trim()) return explicitUrl.trim()
  if (!serviceUrl.trim()) return ''
  const url = new URL(serviceUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/v1/bridge/zapo'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export interface ZapoVoiceBridgeClientOptions {
  session: string
  url: string
  token: string
  serverId: string
  workerId: string
  generation: number
  maxConcurrentCalls: number
  adapter: ZapoVoiceAdapter
  webSocketFactory?: WebSocketFactory
  reconnectBaseMs?: number
}

export class ZapoVoiceBridgeClient {
  private ws?: WebSocket
  private running = false
  private ready = false
  private reconnectTimer?: NodeJS.Timeout
  private reconnectAttempt = 0
  private nextStreamId = 1
  private readonly callToStream = new Map<string, number>()
  private readonly streamToCall = new Map<number, string>()
  private readonly outboundSequence = new Map<number, number>()
  private readonly pausedFeedCalls = new Set<string>()

  constructor(private readonly options: ZapoVoiceBridgeClientOptions) {}

  start() {
    if (this.running) return
    this.running = true
    this.connect()
  }

  stop(reason = 'session_offline') {
    this.running = false
    this.ready = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'session.status', session: this.options.session, status: 'offline', reason })
      this.ws.close(1000, reason)
    } else {
      this.ws?.terminate()
    }
    this.ws = undefined
    this.clearStreams()
  }

  isReady() {
    return this.ready && this.ws?.readyState === WebSocket.OPEN
  }

  publishIncoming(call: any, callerIdentity: ZapoVoiceCallerIdentity = {}) {
    if (!this.isReady()) return false
    this.send({
      type: 'call.incoming',
      session: this.options.session,
      callId: call.callId,
      direction: 'incoming',
      peerJid: call.peerJid,
      callerPn: confirmedZapoVoicePhone(callerIdentity.callerPn) || confirmedZapoVoicePhone(call.callerPn),
      callerName: callerIdentity.callerName,
      callerNameSource: callerIdentity.callerNameSource,
      media: 'audio',
      canAccept: !!call.canAccept,
    })
    this.ensureStream(call.callId)
    return true
  }

  publishState(call: any) {
    if (!this.isReady()) return false
    this.send({
      type: 'call.state',
      session: this.options.session,
      callId: call.callId,
      state: `${call.stateData?.state || 'unknown'}`,
      direction: call.direction === 'outgoing' ? 'outgoing' : 'incoming',
    })
    return true
  }

  publishEnded(call: any) {
    if (!this.isReady()) return false
    const reason = `${call.stateData?.endReason || 'ended'}`
    this.closeStream(call.callId, reason)
    this.send({ type: 'call.ended', session: this.options.session, callId: call.callId, reason })
    return true
  }

  publishError(error: Error, callId?: string) {
    if (!this.isReady()) return false
    this.send({ type: 'call.error', session: this.options.session, callId, code: (error as any).code || 'voip_error', message: error.message })
    return true
  }

  publishInboundAudio(callId: string, pcm: Float32Array) {
    if (!this.isReady()) return false
    const streamId = this.ensureStream(callId)
    const sequence = this.outboundSequence.get(streamId) || 0
    this.outboundSequence.set(streamId, (sequence + 1) >>> 0)
    this.ws!.send(encodeVoipBridgeAudioFrame({ direction: 'uno_to_voip', streamId, sequence, pcm }), { binary: true })
    return true
  }

  private connect() {
    if (!this.running || !this.options.url || !this.options.token) return
    const factory = this.options.webSocketFactory || ((url, options) => new WebSocket(url, options))
    const ws = factory(this.options.url, { headers: { Authorization: `Bearer ${this.options.token}` } })
    this.ws = ws
    ws.on('open', () => {
      if (this.ws !== ws || !this.running) return ws.close()
      ws.send(
        encodeVoipBridgeControl({
          type: 'bridge.hello',
          protocolVersion: 1,
          provider: 'zapo',
          session: this.options.session,
          serverId: this.options.serverId,
          workerId: this.options.workerId,
          generation: this.options.generation,
          maxConcurrentCalls: this.options.maxConcurrentCalls,
          capabilities: ['incoming_call', 'outgoing_call', 'live_audio', 'mute'],
        }),
      )
    })
    ws.on('message', (data, isBinary) => {
      if (this.ws !== ws) return
      try {
        if (isBinary) this.handleAudio(Buffer.from(data as any))
        else void this.handleControl(parseVoipBridgeControl(data.toString()))
      } catch (error) {
        logger.warn(error as any, 'Invalid VoIP bridge frame for Zapo session %s', this.options.session)
        ws.close(1008, 'invalid_bridge_frame')
      }
    })
    ws.on('close', () => this.handleClose(ws))
    ws.on('error', (error) => logger.warn(error as any, 'VoIP bridge error for Zapo session %s', this.options.session))
  }

  private async handleControl(message: VoipBridgeControlMessage) {
    if ('session' in message && message.session !== this.options.session) throw new Error('voip_bridge_session_mismatch')
    if (message.type === 'bridge.ready') {
      this.ready = true
      this.reconnectAttempt = 0
      this.send({ type: 'session.status', session: this.options.session, status: 'online' })
      for (const call of this.options.adapter.getCalls()) {
        if (!call.isEnded) {
          this.publishState(call)
          this.ensureStream(call.callId)
        }
      }
      logger.info('VoIP bridge ready for Zapo session %s connection=%s', this.options.session, message.connectionId)
      return
    }
    if (message.type === 'bridge.ping') {
      this.send({ type: 'bridge.pong', timestamp: message.timestamp })
      return
    }
    if (message.type === 'call.command') await this.executeCommand(message)
  }

  private async executeCommand(message: VoipBridgeCallCommand) {
    try {
      let callId = message.callId
      if (message.command === 'start') callId = await this.options.adapter.start(message.peerJid!, message.peerDevices)
      else if (message.command === 'accept') await this.options.adapter.accept(callId!)
      else if (message.command === 'reject') await this.options.adapter.reject(callId!, message.reason)
      else if (message.command === 'end') await this.options.adapter.end(callId!, message.reason)
      else if (message.command === 'mute') this.options.adapter.mute(callId!, message.muted!)
      this.send({
        type: 'call.command.result',
        requestId: message.requestId,
        session: this.options.session,
        command: message.command,
        ok: true,
        callId,
      })
      if (callId && (message.command === 'start' || message.command === 'accept')) this.ensureStream(callId)
    } catch (error) {
      const value = error instanceof Error ? error : new Error(`${error}`)
      this.send({
        type: 'call.command.result',
        requestId: message.requestId,
        session: this.options.session,
        command: message.command,
        ok: false,
        callId: message.callId,
        error: { code: `${(value as any).code || 'command_failed'}`, message: value.message },
      })
    }
  }

  private handleAudio(data: Buffer) {
    const frame = decodeVoipBridgeAudioFrame(data)
    if (frame.direction !== 'voip_to_uno') throw new Error('unexpected_audio_direction')
    const callId = this.streamToCall.get(frame.streamId)
    if (!callId) throw new Error('unknown_audio_stream')
    const bufferedMs = this.options.adapter.bufferedMs(callId)
    const watermarks = this.options.adapter.watermarks()
    if (this.pausedFeedCalls.has(callId)) {
      if (bufferedMs > watermarks.resumeMs) return
      this.pausedFeedCalls.delete(callId)
    }
    if (bufferedMs >= watermarks.pauseMs) {
      this.pausedFeedCalls.add(callId)
      return
    }
    this.options.adapter.feed(callId, frame.pcm)
  }

  private ensureStream(callId: string) {
    const current = this.callToStream.get(callId)
    if (current) return current
    const streamId = this.nextStreamId++ >>> 0 || this.nextStreamId++ >>> 0
    this.callToStream.set(callId, streamId)
    this.streamToCall.set(streamId, callId)
    this.outboundSequence.set(streamId, 0)
    this.send({
      type: 'audio.stream.open',
      session: this.options.session,
      callId,
      streamId,
      sampleRate: VOIP_BRIDGE_AUDIO_SAMPLE_RATE,
      channels: 1,
      samplesPerFrame: VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME,
    })
    return streamId
  }

  private closeStream(callId: string, reason: string) {
    const streamId = this.callToStream.get(callId)
    if (!streamId) return
    this.send({ type: 'audio.stream.close', session: this.options.session, callId, streamId, reason })
    this.callToStream.delete(callId)
    this.streamToCall.delete(streamId)
    this.outboundSequence.delete(streamId)
    this.pausedFeedCalls.delete(callId)
  }

  private send(message: VoipBridgeControlMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeVoipBridgeControl(message))
  }

  private handleClose(ws: WebSocket) {
    if (this.ws !== ws) return
    this.ws = undefined
    this.ready = false
    this.clearStreams()
    if (!this.running) return
    const delay = Math.min(30_000, (this.options.reconnectBaseMs || 1_000) * 2 ** Math.min(this.reconnectAttempt++, 5))
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
    this.reconnectTimer.unref?.()
  }

  private clearStreams() {
    this.callToStream.clear()
    this.streamToCall.clear()
    this.outboundSequence.clear()
    this.pausedFeedCalls.clear()
  }
}
