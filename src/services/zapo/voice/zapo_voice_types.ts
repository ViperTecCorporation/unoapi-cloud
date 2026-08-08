export const VOIP_BRIDGE_PROTOCOL_VERSION = 1 as const
export const VOIP_BRIDGE_PROVIDER = 'zapo' as const
export const VOIP_BRIDGE_AUDIO_MAGIC = 'VPA1' as const
export const VOIP_BRIDGE_AUDIO_HEADER_BYTES = 16
export const VOIP_BRIDGE_AUDIO_SAMPLE_RATE = 16_000
export const VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME = 960
export const VOIP_BRIDGE_AUDIO_BYTES_PER_SAMPLE = 4
export const VOIP_BRIDGE_AUDIO_PAYLOAD_BYTES = VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME * VOIP_BRIDGE_AUDIO_BYTES_PER_SAMPLE
export const VOIP_BRIDGE_AUDIO_FRAME_BYTES = VOIP_BRIDGE_AUDIO_HEADER_BYTES + VOIP_BRIDGE_AUDIO_PAYLOAD_BYTES

export type VoipBridgeCapability = 'incoming_call' | 'outgoing_call' | 'live_audio' | 'mute'

export type VoipBridgeCallDirection = 'incoming' | 'outgoing'
export type VoipBridgeAudioDirection = 'uno_to_voip' | 'voip_to_uno'
export type VoipBridgeCommandName = 'start' | 'accept' | 'reject' | 'end' | 'mute'
export type VoipBridgeCallerNameSource = 'display_name' | 'push_name' | 'username'

export interface VoipBridgeHello {
  type: 'bridge.hello'
  protocolVersion: typeof VOIP_BRIDGE_PROTOCOL_VERSION
  provider: typeof VOIP_BRIDGE_PROVIDER
  session: string
  serverId: string
  workerId: string
  generation: number
  maxConcurrentCalls: number
  capabilities: VoipBridgeCapability[]
}

export interface VoipBridgeReady {
  type: 'bridge.ready'
  protocolVersion: typeof VOIP_BRIDGE_PROTOCOL_VERSION
  session: string
  connectionId: string
  heartbeatIntervalMs: number
}

export interface VoipBridgeHeartbeat {
  type: 'bridge.ping' | 'bridge.pong'
  timestamp: number
}

export interface VoipBridgeSessionStatus {
  type: 'session.status'
  session: string
  status: 'online' | 'offline'
  reason?: string
}

export interface VoipBridgeCallIncoming {
  type: 'call.incoming'
  session: string
  callId: string
  direction: 'incoming'
  peerJid: string
  callerPn?: string
  callerName?: string
  callerNameSource?: VoipBridgeCallerNameSource
  media: 'audio'
  canAccept: boolean
}

export interface VoipBridgeCallState {
  type: 'call.state'
  session: string
  callId: string
  state: string
  direction: VoipBridgeCallDirection
}

export interface VoipBridgeCallEnded {
  type: 'call.ended'
  session: string
  callId: string
  reason: string
}

export interface VoipBridgeCallError {
  type: 'call.error'
  session: string
  callId?: string
  code: string
  message: string
}

export interface VoipBridgeCallCommand {
  type: 'call.command'
  requestId: string
  session: string
  command: VoipBridgeCommandName
  callId?: string
  peerJid?: string
  peerDevices?: string[]
  reason?: string
  muted?: boolean
}

export interface VoipBridgeCallCommandResult {
  type: 'call.command.result'
  requestId: string
  session: string
  command: VoipBridgeCommandName
  ok: boolean
  callId?: string
  error?: {
    code: string
    message: string
  }
}

export interface VoipBridgeAudioStreamOpen {
  type: 'audio.stream.open'
  session: string
  callId: string
  streamId: number
  sampleRate: typeof VOIP_BRIDGE_AUDIO_SAMPLE_RATE
  channels: 1
  samplesPerFrame: typeof VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME
}

export interface VoipBridgeAudioStreamClose {
  type: 'audio.stream.close'
  session: string
  callId: string
  streamId: number
  reason: string
}

export type VoipBridgeControlMessage =
  | VoipBridgeHello
  | VoipBridgeReady
  | VoipBridgeHeartbeat
  | VoipBridgeSessionStatus
  | VoipBridgeCallIncoming
  | VoipBridgeCallState
  | VoipBridgeCallEnded
  | VoipBridgeCallError
  | VoipBridgeCallCommand
  | VoipBridgeCallCommandResult
  | VoipBridgeAudioStreamOpen
  | VoipBridgeAudioStreamClose

export interface VoipBridgeAudioFrame {
  direction: VoipBridgeAudioDirection
  streamId: number
  sequence: number
  pcm: Float32Array
}
