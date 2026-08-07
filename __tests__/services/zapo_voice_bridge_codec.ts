import {
  decodeVoipBridgeAudioFrame,
  encodeVoipBridgeAudioFrame,
  encodeVoipBridgeControl,
  parseVoipBridgeControl,
  VoipBridgeProtocolError,
} from '../../src/services/zapo/voice/zapo_voice_bridge_codec'
import {
  VOIP_BRIDGE_AUDIO_FRAME_BYTES,
  VOIP_BRIDGE_AUDIO_HEADER_BYTES,
  VOIP_BRIDGE_AUDIO_SAMPLE_RATE,
  VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME,
  type VoipBridgeControlMessage,
  type VoipBridgeHello,
} from '../../src/services/zapo/voice/zapo_voice_types'

const expectProtocolError = (run: () => unknown, code: string) => {
  try {
    run()
    throw new Error('expected protocol error')
  } catch (error) {
    expect(error).toBeInstanceOf(VoipBridgeProtocolError)
    expect((error as VoipBridgeProtocolError).code).toBe(code)
  }
}

describe('Zapo voip bridge control codec', () => {
  const hello: VoipBridgeHello = {
    type: 'bridge.hello',
    protocolVersion: 1,
    provider: 'zapo',
    session: '5566999554300',
    serverId: 'server_1',
    workerId: 'zapo-worker-1',
    generation: 12,
    maxConcurrentCalls: 2,
    capabilities: ['incoming_call', 'outgoing_call', 'live_audio', 'mute'],
  }

  test('round-trips a valid handshake', () => {
    const encoded = encodeVoipBridgeControl(hello)
    expect(parseVoipBridgeControl(encoded)).toEqual(hello)
  })

  test.each<VoipBridgeControlMessage>([
    {
      type: 'bridge.ready',
      protocolVersion: 1,
      session: hello.session,
      connectionId: 'connection_1',
      heartbeatIntervalMs: 15_000,
    },
    { type: 'bridge.ping', timestamp: 1_725_000_000_000 },
    { type: 'bridge.pong', timestamp: 1_725_000_000_001 },
    { type: 'session.status', session: hello.session, status: 'online' },
    { type: 'session.status', session: hello.session, status: 'offline', reason: 'worker_stopped' },
    {
      type: 'call.incoming',
      session: hello.session,
      callId: 'call_in_1',
      direction: 'incoming',
      peerJid: '94047083475061@lid',
      callerPn: '5566996269251',
      callerName: 'Joao da Silva',
      callerNameSource: 'display_name',
      media: 'audio',
      canAccept: true,
    },
    {
      type: 'call.state',
      session: hello.session,
      callId: 'call_out_1',
      state: 'ringing',
      direction: 'outgoing',
    },
    { type: 'call.ended', session: hello.session, callId: 'call_in_1', reason: 'remote_hangup' },
    {
      type: 'call.error',
      session: hello.session,
      callId: 'call_in_1',
      code: 'media_failed',
      message: 'Audio stream failed',
    },
    {
      type: 'call.command',
      requestId: 'request_start_1',
      session: hello.session,
      command: 'start',
      peerJid: '94047083475061@lid',
      peerDevices: ['94047083475061:0@lid'],
    },
    {
      type: 'call.command.result',
      requestId: 'request_start_1',
      session: hello.session,
      command: 'start',
      ok: true,
      callId: 'call_out_1',
    },
    {
      type: 'audio.stream.open',
      session: hello.session,
      callId: 'call_in_1',
      streamId: 15,
      sampleRate: VOIP_BRIDGE_AUDIO_SAMPLE_RATE,
      channels: 1,
      samplesPerFrame: VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME,
    },
    {
      type: 'audio.stream.close',
      session: hello.session,
      callId: 'call_in_1',
      streamId: 15,
      reason: 'call_ended',
    },
  ])('round-trips $type control messages', (message) => {
    expect(parseVoipBridgeControl(encodeVoipBridgeControl(message))).toMatchObject(message)
  })

  test('normalizes strings received in a command', () => {
    expect(
      parseVoipBridgeControl(
        JSON.stringify({
          type: 'call.command',
          requestId: ' req_01 ',
          session: '5566999554300',
          command: 'start',
          peerJid: ' 94047083475061@lid ',
          peerDevices: [' 94047083475061:0@lid '],
        }),
      ),
    ).toEqual({
      type: 'call.command',
      requestId: 'req_01',
      session: '5566999554300',
      command: 'start',
      callId: undefined,
      peerJid: '94047083475061@lid',
      peerDevices: ['94047083475061:0@lid'],
      reason: undefined,
      muted: undefined,
    })
  })

  test.each([
    [{ ...hello, protocolVersion: 2 }, 'unsupported_protocol_version'],
    [{ ...hello, provider: 'other' }, 'unsupported_provider'],
    [{ ...hello, session: 'invalid' }, 'invalid_control_field'],
    [{ ...hello, capabilities: ['live_audio', 'live_audio'] }, 'invalid_control_field'],
    [{ type: 'call.command', requestId: 'req', session: hello.session, command: 'accept' }, 'invalid_control_field'],
    [{ type: 'call.command', requestId: 'req', session: hello.session, command: 'mute', callId: 'call_1' }, 'invalid_control_field'],
    [{ type: 'unknown' }, 'unknown_control_message'],
  ])('rejects invalid control envelopes', (payload, code) => {
    expectProtocolError(() => parseVoipBridgeControl(JSON.stringify(payload)), code)
  })

  test('requires an error object only for failed command results', () => {
    expectProtocolError(
      () =>
        parseVoipBridgeControl(
          JSON.stringify({
            type: 'call.command.result',
            requestId: 'req_01',
            session: hello.session,
            command: 'accept',
            ok: false,
          }),
        ),
      'invalid_control_field',
    )

    expect(
      parseVoipBridgeControl(
        JSON.stringify({
          type: 'call.command.result',
          requestId: 'req_01',
          session: hello.session,
          command: 'accept',
          callId: 'call_1',
          ok: false,
          error: { code: 'call_not_found', message: 'Call not found' },
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'call_not_found' } })
  })

  test('counts incoming callerName limits by Unicode code points', () => {
    const callerName = '😀'.repeat(128)
    const incoming: VoipBridgeControlMessage = {
      type: 'call.incoming',
      session: hello.session,
      callId: 'call_in_unicode',
      direction: 'incoming',
      peerJid: '94047083475061@lid',
      callerName,
      callerNameSource: 'display_name',
      media: 'audio',
      canAccept: true,
    }

    expect(parseVoipBridgeControl(encodeVoipBridgeControl(incoming))).toMatchObject({ callerName })
    expectProtocolError(
      () => parseVoipBridgeControl(JSON.stringify({ ...incoming, callerName: `${callerName}😀` })),
      'invalid_control_field',
    )
  })

  test.each([
    ['Joao\r\nX-Injected: yes', 'display_name'],
    ['Joao', 'unknown'],
  ])('rejects unsafe incoming caller identity name=%s source=%s', (callerName, callerNameSource) => {
    expectProtocolError(
      () => parseVoipBridgeControl(JSON.stringify({
        type: 'call.incoming',
        session: hello.session,
        callId: 'call_in_unsafe',
        direction: 'incoming',
        peerJid: '94047083475061@lid',
        callerPn: '5566996269251',
        callerName,
        callerNameSource,
        media: 'audio',
        canAccept: true,
      })),
      'invalid_control_field',
    )
  })

  test.each([
    ['invalid_control_json', '{'],
    ['invalid_control_message', '[]'],
    ['invalid_control_message', 'null'],
  ])('rejects malformed control input with %s', (code, input) => {
    expectProtocolError(() => parseVoipBridgeControl(input), code)
  })

  test('rejects unsupported audio stream formats', () => {
    expectProtocolError(
      () =>
        parseVoipBridgeControl(
          JSON.stringify({
            type: 'audio.stream.open',
            session: hello.session,
            callId: 'call_1',
            streamId: 1,
            sampleRate: 48_000,
            channels: 2,
            samplesPerFrame: 960,
          }),
        ),
      'unsupported_audio_format',
    )
  })
})

describe('Zapo voip bridge audio codec', () => {
  test('encodes the documented VPA1 header and round-trips PCM', () => {
    const pcm = Float32Array.from({ length: VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME }, (_, index) => Math.sin(index / 12) * 0.5)
    const encoded = encodeVoipBridgeAudioFrame({
      direction: 'uno_to_voip',
      streamId: 0x01020304,
      sequence: 42,
      pcm,
    })

    expect(encoded).toHaveLength(VOIP_BRIDGE_AUDIO_FRAME_BYTES)
    expect(encoded.subarray(0, VOIP_BRIDGE_AUDIO_HEADER_BYTES).toString('hex')).toBe('5650413101000000010203040000002a')

    const decoded = decodeVoipBridgeAudioFrame(encoded)
    expect(decoded.direction).toBe('uno_to_voip')
    expect(decoded.streamId).toBe(0x01020304)
    expect(decoded.sequence).toBe(42)
    expect([...decoded.pcm]).toEqual([...pcm])
  })

  test('supports the reverse audio direction', () => {
    const encoded = encodeVoipBridgeAudioFrame({
      direction: 'voip_to_uno',
      streamId: 7,
      sequence: 0xffff_ffff,
      pcm: new Float32Array(VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME),
    })
    expect(encoded.readUInt8(5)).toBe(1)
    expect(decodeVoipBridgeAudioFrame(new Uint8Array(encoded)).direction).toBe('voip_to_uno')
  })

  test.each([
    ['invalid_audio_frame_size', (frame: Buffer) => frame.subarray(0, -1)],
    ['invalid_audio_magic', (frame: Buffer) => Buffer.from(frame).fill(0, 0, 4)],
    [
      'unsupported_protocol_version',
      (frame: Buffer) => {
        const copy = Buffer.from(frame)
        copy.writeUInt8(2, 4)
        return copy
      },
    ],
    [
      'invalid_audio_direction',
      (frame: Buffer) => {
        const copy = Buffer.from(frame)
        copy.writeUInt8(9, 5)
        return copy
      },
    ],
    [
      'unsupported_audio_flags',
      (frame: Buffer) => {
        const copy = Buffer.from(frame)
        copy.writeUInt16BE(1, 6)
        return copy
      },
    ],
  ])('rejects malformed binary frames with %s', (code, mutate) => {
    const valid = encodeVoipBridgeAudioFrame({
      direction: 'uno_to_voip',
      streamId: 1,
      sequence: 0,
      pcm: new Float32Array(VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME),
    })
    expectProtocolError(() => decodeVoipBridgeAudioFrame(mutate(valid)), code)
  })

  test('rejects invalid audio input before allocating a frame', () => {
    expectProtocolError(
      () =>
        encodeVoipBridgeAudioFrame({
          direction: 'uno_to_voip',
          streamId: 1,
          sequence: 0,
          pcm: new Float32Array(10),
        }),
      'invalid_audio_frame',
    )

    expectProtocolError(
      () =>
        encodeVoipBridgeAudioFrame({
          direction: 'uno_to_voip',
          streamId: 0,
          sequence: 0,
          pcm: new Float32Array(VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME),
        }),
      'invalid_audio_frame',
    )
  })

  test('rejects stream zero while decoding', () => {
    const encoded = encodeVoipBridgeAudioFrame({
      direction: 'uno_to_voip',
      streamId: 1,
      sequence: 0,
      pcm: new Float32Array(VOIP_BRIDGE_AUDIO_SAMPLES_PER_FRAME),
    })
    encoded.writeUInt32BE(0, 8)
    expectProtocolError(() => decodeVoipBridgeAudioFrame(encoded), 'invalid_audio_frame')
  })
})
