import type { CallInfo } from '@zapo-js/voip'

export interface ZapoVoipCoordinator {
  startCall(options: { peerJid: string; isVideo?: boolean; peerDevices?: string[] }): Promise<string>
  acceptCall(callId: string): Promise<void>
  rejectCall(callId: string, reason?: any): Promise<void>
  endCall(callId: string, reason?: any): Promise<void>
  setMute(callId: string, muted: boolean): void
  setExternalAudioMode(callId: string, enabled: boolean): void
  feedLiveAudio(callId: string, data: Float32Array): number
  getLiveBufferMs(callId: string): number
  getFeedWatermarksMs(): { pauseMs: number; resumeMs: number }
  getCall(callId: string): CallInfo | null
  getCalls(): readonly CallInfo[]
}

export class ZapoVoiceAdapter {
  constructor(private readonly coordinator: ZapoVoipCoordinator) {}

  async start(peerJid: string, peerDevices?: string[]) {
    const callId = await this.coordinator.startCall({ peerJid, peerDevices })
    this.coordinator.setExternalAudioMode(callId, true)
    return callId
  }

  async accept(callId: string) {
    this.coordinator.setExternalAudioMode(callId, true)
    await this.coordinator.acceptCall(callId)
  }

  reject(callId: string, reason?: unknown) {
    return this.coordinator.rejectCall(callId, reason)
  }
  end(callId: string, reason?: unknown) {
    return this.coordinator.endCall(callId, reason)
  }
  mute(callId: string, muted: boolean) {
    this.coordinator.setMute(callId, muted)
  }
  feed(callId: string, pcm: Float32Array) {
    return this.coordinator.feedLiveAudio(callId, pcm)
  }
  bufferedMs(callId: string) {
    return this.coordinator.getLiveBufferMs(callId)
  }
  watermarks() {
    return this.coordinator.getFeedWatermarksMs()
  }
  getCall(callId: string) {
    return this.coordinator.getCall(callId)
  }
  getCalls() {
    return this.coordinator.getCalls()
  }
}
