import { once } from 'node:events'
import WebSocket, { WebSocketServer } from 'ws'
import { encodeVoipBridgeAudioFrame } from '../../src/services/zapo/voice/zapo_voice_bridge_codec'
import { resolveZapoVoiceBridgeUrl, ZapoVoiceBridgeClient } from '../../src/services/zapo/voice/zapo_voice_bridge_client'

describe('ZapoVoiceBridgeClient', () => {
  test('derives the bridge websocket URL from the service URL', () => {
    expect(resolveZapoVoiceBridgeUrl('https://voip.example.com/base')).toBe('wss://voip.example.com/v1/bridge/zapo')
    expect(resolveZapoVoiceBridgeUrl('http://voip:3097')).toBe('ws://voip:3097/v1/bridge/zapo')
  })

  test('normalizes the confirmed caller PN before publishing an incoming call', () => {
    const adapter = { getCalls: jest.fn().mockReturnValue([]) }
    const send = jest.fn()
    const client = new ZapoVoiceBridgeClient({
      session: '5566999554300',
      url: 'ws://127.0.0.1/unused',
      token: 'secret',
      serverId: 'server_1',
      workerId: 'worker_1',
      generation: 1,
      maxConcurrentCalls: 2,
      adapter: adapter as any,
    })
    ;(client as any).ready = true
    ;(client as any).ws = { readyState: WebSocket.OPEN, send }

    expect(client.publishIncoming({
      callId: 'call-old-mobile',
      peerJid: '123@lid',
      canAccept: true,
    }, {
      callerPn: '556699554300@s.whatsapp.net',
      callerName: 'Contato salvo',
      callerNameSource: 'display_name',
    })).toBe(true)

    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: 'call.incoming',
      callerPn: '5566999554300',
      callerName: 'Contato salvo',
    })
  })

  test('handshakes, executes a start command and routes binary audio by stream', async () => {
    const wss = new WebSocketServer({ port: 0 })
    await once(wss, 'listening')
    const address = wss.address()
    if (!address || typeof address === 'string') throw new Error('missing websocket address')
    let resolveFeed!: () => void
    const feedReceived = new Promise<void>((resolve) => {
      resolveFeed = resolve
    })
    const adapter = {
      start: jest.fn().mockResolvedValue('call_1'),
      accept: jest.fn(),
      reject: jest.fn(),
      end: jest.fn(),
      mute: jest.fn(),
      feed: jest.fn().mockImplementation(() => {
        resolveFeed()
        return 0
      }),
      bufferedMs: jest.fn().mockReturnValue(0),
      watermarks: jest.fn().mockReturnValue({ pauseMs: 500, resumeMs: 200 }),
      getCalls: jest.fn().mockReturnValue([]),
    }
    const result = new Promise<any>((resolve, reject) => {
      wss.once('connection', (ws, request) => {
        expect(request.headers.authorization).toBe('Bearer secret')
        ws.on('message', (data, isBinary) => {
          if (isBinary) return
          const message = JSON.parse(data.toString())
          if (message.type === 'bridge.hello') {
            ws.send(
              JSON.stringify({
                type: 'bridge.ready',
                protocolVersion: 1,
                session: '5566999554300',
                connectionId: 'connection_1',
                heartbeatIntervalMs: 15000,
              }),
            )
            ws.send(
              JSON.stringify({
                type: 'call.command',
                requestId: 'request_1',
                session: '5566999554300',
                command: 'start',
                peerJid: '5511@s.whatsapp.net',
              }),
            )
          } else if (message.type === 'audio.stream.open') {
            ws.send(encodeVoipBridgeAudioFrame({ direction: 'voip_to_uno', streamId: message.streamId, sequence: 0, pcm: new Float32Array(960) }))
          } else if (message.type === 'call.command.result') resolve(message)
        })
        ws.on('error', reject)
      })
    })
    const client = new ZapoVoiceBridgeClient({
      session: '5566999554300',
      url: `ws://127.0.0.1:${address.port}`,
      token: 'secret',
      serverId: 'server_1',
      workerId: 'worker_1',
      generation: 1,
      maxConcurrentCalls: 2,
      adapter: adapter as any,
    })
    try {
      client.start()
      await expect(result).resolves.toMatchObject({ ok: true, callId: 'call_1' })
      await feedReceived
      expect(adapter.start).toHaveBeenCalledWith('5511@s.whatsapp.net', undefined)
      expect(adapter.feed).toHaveBeenCalledWith('call_1', expect.any(Float32Array))
    } finally {
      client.stop('test_complete')
      for (const socket of wss.clients) socket.terminate()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
    }
  })
})
