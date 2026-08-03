import {
  VOIP_BRIDGE_AUDIO_FRAME_BYTES,
  VOIP_BRIDGE_AUDIO_HEADER_BYTES,
  VOIP_BRIDGE_AUDIO_MAGIC,
  VOIP_BRIDGE_AUDIO_SAMPLE_RATE,
  VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME,
  VOIP_BRIDGE_PROTOCOL_VERSION,
  VOIP_BRIDGE_PROVIDER,
  type VoipBridgeAudioDirection,
  type VoipBridgeAudioFrame,
  type VoipBridgeCapability,
  type VoipBridgeCommandName,
  type VoipBridgeControlMessage,
} from './zapo_voice_types'

type UnknownRecord = Record<string, unknown>

const CONTROL_MESSAGE_TYPES = new Set([
  'bridge.hello',
  'bridge.ready',
  'bridge.ping',
  'bridge.pong',
  'session.status',
  'call.incoming',
  'call.state',
  'call.ended',
  'call.error',
  'call.command',
  'call.command.result',
  'audio.stream.open',
  'audio.stream.close',
])

const CAPABILITIES = new Set<VoipBridgeCapability>(['incoming_call', 'outgoing_call', 'live_audio', 'mute'])

const COMMANDS = new Set<VoipBridgeCommandName>(['start', 'accept', 'reject', 'end', 'mute'])

const AUDIO_DIRECTION_TO_BYTE: Record<VoipBridgeAudioDirection, number> = {
  uno_to_voip: 0,
  voip_to_uno: 1,
}

const BYTE_TO_AUDIO_DIRECTION: Record<number, VoipBridgeAudioDirection | undefined> = {
  0: 'uno_to_voip',
  1: 'voip_to_uno',
}

export class VoipBridgeProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'VoipBridgeProtocolError'
  }
}

const protocolError = (code: string, message: string): never => {
  throw new VoipBridgeProtocolError(code, message)
}

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

const requireString = (value: unknown, field: string, options: { optional?: boolean; maxLength?: number } = {}): string | undefined => {
  if (value === undefined && options.optional) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    return protocolError('invalid_control_field', `${field} must be a non-empty string`)
  }
  const normalized = value.trim()
  if (normalized.length > (options.maxLength ?? 256)) {
    return protocolError('invalid_control_field', `${field} exceeds the maximum length`)
  }
  return normalized
}

const requireInteger = (value: unknown, field: string, options: { min?: number; max?: number } = {}): number => {
  if (!Number.isSafeInteger(value)) {
    return protocolError('invalid_control_field', `${field} must be an integer`)
  }
  const parsed = value as number
  if (parsed < (options.min ?? 0) || parsed > (options.max ?? Number.MAX_SAFE_INTEGER)) {
    return protocolError('invalid_control_field', `${field} is outside the accepted range`)
  }
  return parsed
}

const requireBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') {
    return protocolError('invalid_control_field', `${field} must be a boolean`)
  }
  return value
}

const requireProtocolVersion = (value: unknown) => {
  if (value !== VOIP_BRIDGE_PROTOCOL_VERSION) {
    protocolError('unsupported_protocol_version', `protocolVersion must be ${VOIP_BRIDGE_PROTOCOL_VERSION}`)
  }
}

const requireSession = (value: unknown) => {
  const session = requireString(value, 'session', { maxLength: 32 })!
  if (!/^\d{8,20}$/.test(session)) {
    protocolError('invalid_control_field', 'session must contain between 8 and 20 digits')
  }
  return session
}

const requireStringArray = (value: unknown, field: string, options: { optional?: boolean; maxItems?: number } = {}): string[] | undefined => {
  if (value === undefined && options.optional) return undefined
  if (!Array.isArray(value) || value.length > (options.maxItems ?? 64)) {
    return protocolError('invalid_control_field', `${field} must be a bounded string array`)
  }
  return value.map((item, index) => requireString(item, `${field}[${index}]`)!)
}

const validateControlMessage = (message: UnknownRecord): VoipBridgeControlMessage => {
  const type = requireString(message.type, 'type', { maxLength: 64 })!
  if (!CONTROL_MESSAGE_TYPES.has(type)) {
    protocolError('unknown_control_message', `unsupported control message type: ${type}`)
  }

  switch (type) {
    case 'bridge.hello': {
      requireProtocolVersion(message.protocolVersion)
      if (message.provider !== VOIP_BRIDGE_PROVIDER) {
        protocolError('unsupported_provider', `provider must be ${VOIP_BRIDGE_PROVIDER}`)
      }
      const capabilities = requireStringArray(message.capabilities, 'capabilities', { maxItems: CAPABILITIES.size })!
      if (new Set(capabilities).size !== capabilities.length || capabilities.some((item) => !CAPABILITIES.has(item as VoipBridgeCapability))) {
        protocolError('invalid_control_field', 'capabilities contains duplicate or unsupported values')
      }
      return {
        type,
        protocolVersion: VOIP_BRIDGE_PROTOCOL_VERSION,
        provider: VOIP_BRIDGE_PROVIDER,
        session: requireSession(message.session),
        serverId: requireString(message.serverId, 'serverId', { maxLength: 128 })!,
        workerId: requireString(message.workerId, 'workerId', { maxLength: 128 })!,
        generation: requireInteger(message.generation, 'generation'),
        maxConcurrentCalls: requireInteger(message.maxConcurrentCalls, 'maxConcurrentCalls', { min: 1, max: 32 }),
        capabilities: capabilities as VoipBridgeCapability[],
      }
    }
    case 'bridge.ready':
      requireProtocolVersion(message.protocolVersion)
      return {
        type,
        protocolVersion: VOIP_BRIDGE_PROTOCOL_VERSION,
        session: requireSession(message.session),
        connectionId: requireString(message.connectionId, 'connectionId', { maxLength: 128 })!,
        heartbeatIntervalMs: requireInteger(message.heartbeatIntervalMs, 'heartbeatIntervalMs', { min: 1_000, max: 300_000 }),
      }
    case 'bridge.ping':
    case 'bridge.pong':
      return {
        type,
        timestamp: requireInteger(message.timestamp, 'timestamp'),
      }
    case 'session.status': {
      const status = message.status
      if (status !== 'online' && status !== 'offline') {
        protocolError('invalid_control_field', 'status must be online or offline')
      }
      return {
        type,
        session: requireSession(message.session),
        status: status as 'online' | 'offline',
        reason: requireString(message.reason, 'reason', { optional: true, maxLength: 256 }),
      }
    }
    case 'call.incoming':
      if (message.direction !== 'incoming' || message.media !== 'audio') {
        protocolError('invalid_control_field', 'incoming calls must use direction incoming and media audio')
      }
      return {
        type,
        session: requireSession(message.session),
        callId: requireString(message.callId, 'callId', { maxLength: 128 })!,
        direction: 'incoming',
        peerJid: requireString(message.peerJid, 'peerJid', { maxLength: 256 })!,
        callerPn: requireString(message.callerPn, 'callerPn', { optional: true, maxLength: 32 }),
        media: 'audio',
        canAccept: requireBoolean(message.canAccept, 'canAccept'),
      }
    case 'call.state': {
      const direction = message.direction
      if (direction !== 'incoming' && direction !== 'outgoing') {
        protocolError('invalid_control_field', 'direction must be incoming or outgoing')
      }
      return {
        type,
        session: requireSession(message.session),
        callId: requireString(message.callId, 'callId', { maxLength: 128 })!,
        state: requireString(message.state, 'state', { maxLength: 64 })!,
        direction: direction as 'incoming' | 'outgoing',
      }
    }
    case 'call.ended':
      return {
        type,
        session: requireSession(message.session),
        callId: requireString(message.callId, 'callId', { maxLength: 128 })!,
        reason: requireString(message.reason, 'reason', { maxLength: 256 })!,
      }
    case 'call.error':
      return {
        type,
        session: requireSession(message.session),
        callId: requireString(message.callId, 'callId', { optional: true, maxLength: 128 }),
        code: requireString(message.code, 'code', { maxLength: 128 })!,
        message: requireString(message.message, 'message', { maxLength: 512 })!,
      }
    case 'call.command': {
      const command = requireString(message.command, 'command', { maxLength: 32 }) as VoipBridgeCommandName
      if (!COMMANDS.has(command)) {
        protocolError('invalid_control_field', 'command is unsupported')
      }
      const callId = requireString(message.callId, 'callId', { optional: true, maxLength: 128 })
      const peerJid = requireString(message.peerJid, 'peerJid', { optional: true, maxLength: 256 })
      const muted = message.muted === undefined ? undefined : requireBoolean(message.muted, 'muted')
      if (command === 'start' && !peerJid) {
        protocolError('invalid_control_field', 'peerJid is required for start')
      }
      if (command !== 'start' && !callId) {
        protocolError('invalid_control_field', 'callId is required for this command')
      }
      if (command === 'mute' && muted === undefined) {
        protocolError('invalid_control_field', 'muted is required for mute')
      }
      return {
        type,
        requestId: requireString(message.requestId, 'requestId', { maxLength: 128 })!,
        session: requireSession(message.session),
        command,
        callId,
        peerJid,
        peerDevices: requireStringArray(message.peerDevices, 'peerDevices', { optional: true, maxItems: 32 }),
        reason: requireString(message.reason, 'reason', { optional: true, maxLength: 256 }),
        muted,
      }
    }
    case 'call.command.result': {
      const command = requireString(message.command, 'command', { maxLength: 32 }) as VoipBridgeCommandName
      if (!COMMANDS.has(command)) {
        protocolError('invalid_control_field', 'command is unsupported')
      }
      const ok = requireBoolean(message.ok, 'ok')
      let error: { code: string; message: string } | undefined
      if (message.error !== undefined) {
        if (!isRecord(message.error)) protocolError('invalid_control_field', 'error must be an object')
        const errorValue = message.error as UnknownRecord
        error = {
          code: requireString(errorValue.code, 'error.code', { maxLength: 128 })!,
          message: requireString(errorValue.message, 'error.message', { maxLength: 512 })!,
        }
      }
      if (ok && error) protocolError('invalid_control_field', 'successful results cannot contain error')
      if (!ok && !error) protocolError('invalid_control_field', 'failed results must contain error')
      return {
        type,
        requestId: requireString(message.requestId, 'requestId', { maxLength: 128 })!,
        session: requireSession(message.session),
        command,
        ok,
        callId: requireString(message.callId, 'callId', { optional: true, maxLength: 128 }),
        error,
      }
    }
    case 'audio.stream.open':
      if (
        message.sampleRate !== VOIP_BRIDGE_AUDIO_SAMPLE_RATE ||
        message.channels !== 1 ||
        message.samplesPerFrame !== VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME
      ) {
        protocolError('unsupported_audio_format', 'audio must be Float32 mono 16 kHz with 960 samples per frame')
      }
      return {
        type,
        session: requireSession(message.session),
        callId: requireString(message.callId, 'callId', { maxLength: 128 })!,
        streamId: requireInteger(message.streamId, 'streamId', { min: 1, max: 0xffff_ffff }),
        sampleRate: VOIP_BRIDGE_AUDIO_SAMPLE_RATE,
        channels: 1,
        samplesPerFrame: VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME,
      }
    case 'audio.stream.close':
      return {
        type,
        session: requireSession(message.session),
        callId: requireString(message.callId, 'callId', { maxLength: 128 })!,
        streamId: requireInteger(message.streamId, 'streamId', { min: 1, max: 0xffff_ffff }),
        reason: requireString(message.reason, 'reason', { maxLength: 256 })!,
      }
    default:
      return protocolError('unknown_control_message', `unsupported control message type: ${type}`)
  }
}

export const parseVoipBridgeControl = (input: string | Buffer): VoipBridgeControlMessage => {
  let parsed: unknown
  try {
    parsed = JSON.parse(typeof input === 'string' ? input : input.toString('utf8'))
  } catch {
    return protocolError('invalid_control_json', 'control message is not valid JSON')
  }
  if (!isRecord(parsed)) {
    return protocolError('invalid_control_message', 'control message must be an object')
  }
  return validateControlMessage(parsed)
}

export const encodeVoipBridgeControl = (message: VoipBridgeControlMessage): string =>
  JSON.stringify(validateControlMessage(message as unknown as UnknownRecord))

const requireUint32 = (value: number, field: string) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    protocolError('invalid_audio_frame', `${field} must be an unsigned 32-bit integer`)
  }
  return value
}

export const encodeVoipBridgeAudioFrame = (frame: VoipBridgeAudioFrame): Buffer => {
  if (!(frame.pcm instanceof Float32Array) || frame.pcm.length !== VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME) {
    protocolError('invalid_audio_frame', `pcm must contain ${VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME} Float32 samples`)
  }
  const direction = AUDIO_DIRECTION_TO_BYTE[frame.direction]
  if (direction === undefined) protocolError('invalid_audio_frame', 'audio direction is unsupported')
  const streamId = requireUint32(frame.streamId, 'streamId')
  if (streamId === 0) protocolError('invalid_audio_frame', 'streamId must be greater than zero')
  const sequence = requireUint32(frame.sequence, 'sequence')

  const output = Buffer.allocUnsafe(VOIP_BRIDGE_AUDIO_FRAME_BYTES)
  output.write(VOIP_BRIDGE_AUDIO_MAGIC, 0, 'ascii')
  output.writeUInt8(VOIP_BRIDGE_PROTOCOL_VERSION, 4)
  output.writeUInt8(direction, 5)
  output.writeUInt16BE(0, 6)
  output.writeUInt32BE(streamId, 8)
  output.writeUInt32BE(sequence, 12)
  for (let index = 0; index < frame.pcm.length; index += 1) {
    output.writeFloatLE(frame.pcm[index], VOIP_BRIDGE_AUDIO_HEADER_BYTES + index * 4)
  }
  return output
}

export const decodeVoipBridgeAudioFrame = (input: Buffer | Uint8Array): VoipBridgeAudioFrame => {
  const frame = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (frame.length !== VOIP_BRIDGE_AUDIO_FRAME_BYTES) {
    protocolError('invalid_audio_frame_size', `audio frame must contain ${VOIP_BRIDGE_AUDIO_FRAME_BYTES} bytes`)
  }
  if (frame.toString('ascii', 0, 4) !== VOIP_BRIDGE_AUDIO_MAGIC) {
    protocolError('invalid_audio_magic', `audio frame magic must be ${VOIP_BRIDGE_AUDIO_MAGIC}`)
  }
  if (frame.readUInt8(4) !== VOIP_BRIDGE_PROTOCOL_VERSION) {
    protocolError('unsupported_protocol_version', `audio frame version must be ${VOIP_BRIDGE_PROTOCOL_VERSION}`)
  }
  const direction = BYTE_TO_AUDIO_DIRECTION[frame.readUInt8(5)]
  if (!direction) protocolError('invalid_audio_direction', 'audio frame direction is unsupported')
  if (frame.readUInt16BE(6) !== 0) {
    protocolError('unsupported_audio_flags', 'audio frame flags must be zero in protocol v1')
  }
  const streamId = frame.readUInt32BE(8)
  if (streamId === 0) protocolError('invalid_audio_frame', 'streamId must be greater than zero')
  const pcm = new Float32Array(VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME)
  for (let index = 0; index < pcm.length; index += 1) {
    pcm[index] = frame.readFloatLE(VOIP_BRIDGE_AUDIO_HEADER_BYTES + index * 4)
  }
  return {
    direction: direction!,
    streamId,
    sequence: frame.readUInt32BE(12),
    pcm,
  }
}
