import { ZapoVoiceAdapter } from '../../src/services/zapo/voice/zapo_voice_adapter'

describe('ZapoVoiceAdapter', () => {
  test('delegates every supported command and enables external PCM mode', async () => {
    const coordinator = {
      startCall: jest.fn().mockResolvedValue('call_1'),
      acceptCall: jest.fn().mockResolvedValue(undefined),
      rejectCall: jest.fn().mockResolvedValue(undefined),
      endCall: jest.fn().mockResolvedValue(undefined),
      setMute: jest.fn(),
      setExternalAudioMode: jest.fn(),
      feedLiveAudio: jest.fn().mockReturnValue(60),
      getLiveBufferMs: jest.fn().mockReturnValue(20),
      getFeedWatermarksMs: jest.fn().mockReturnValue({ pauseMs: 500, resumeMs: 200 }),
      getCall: jest.fn().mockReturnValue(null),
      getCalls: jest.fn().mockReturnValue([]),
    }
    const adapter = new ZapoVoiceAdapter(coordinator as any)

    await expect(adapter.start('5511@s.whatsapp.net', ['5511:0@s.whatsapp.net'])).resolves.toBe('call_1')
    await adapter.accept('call_1')
    await adapter.reject('call_1')
    await adapter.end('call_1')
    adapter.mute('call_1', true)
    expect(adapter.feed('call_1', new Float32Array(960))).toBe(60)

    expect(coordinator.setExternalAudioMode).toHaveBeenNthCalledWith(1, 'call_1', true)
    expect(coordinator.setExternalAudioMode).toHaveBeenNthCalledWith(2, 'call_1', true)
    expect(coordinator.acceptCall).toHaveBeenCalledWith('call_1')
    expect(coordinator.acceptCall.mock.invocationCallOrder[0]).toBeLessThan(
      coordinator.setExternalAudioMode.mock.invocationCallOrder[1],
    )
    expect(coordinator.rejectCall).toHaveBeenCalledWith('call_1', undefined)
    expect(coordinator.endCall).toHaveBeenCalledWith('call_1', undefined)
    expect(coordinator.setMute).toHaveBeenCalledWith('call_1', true)
  })
})
