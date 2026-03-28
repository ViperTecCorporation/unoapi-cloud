jest.mock('../../src/utils/audio_convert', () => ({
  __esModule: true,
  convertToOggPtt: jest.fn(async () => ({ buffer: Buffer.from('OGG'), mimetype: 'audio/ogg; codecs=opus' }))
}))
jest.mock('../../src/defaults', () => {
  const actual = jest.requireActual('../../src/defaults')
  return {
    __esModule: true,
    ...actual,
    SEND_AUDIO_MESSAGE_AS_PTT: true,
  }
})
jest.mock('../../src/services/socket')
jest.mock('../../src/services/client_voip', () => ({
  __esModule: true,
  mapBaileysCallStatusToVoipEvent: jest.fn((status: string) => status === 'ringing' ? 'incoming_call' : undefined),
  sendVoipCallEvent: jest.fn(async () => ({ ok: true, status: 200 })),
  sendVoipSignaling: jest.fn(async () => ({ ok: true, status: 200 })),
  extractVoipCommands: jest.fn(() => []),
}))
import { ClientBaileys } from '../../src/services/client_baileys'
import { Client } from '../../src/services/client'
import { Config, getConfig, defaultConfig } from '../../src/services/config'
import { Response } from '../../src/services/response'
import { Listener } from '../../src/services/listener'
import { Store } from '../../src/services/store'
import {
  connect,
  Status,
  sendMessage,
  readMessages,
  rejectCall,
  sendCallNode,
  fetchImageUrl,
  fetchGroupMetadata,
  exists,
  close,
  logout,
} from '../../src/services/socket'
import { mock, mockFn } from 'jest-mock-extended'
import { proto } from '@whiskeysockets/baileys'
import { DataStore } from '../../src/services/data_store'
import { Incoming } from '../../src/services/incoming'
import { dataStores } from '../../src/services/data_store'
import logger from '../../src/services/logger'
import { SessionStore } from '../../src/services/session_store'
import { SendError } from '../../src/services/send_error'
import { sendVoipCallEvent, sendVoipSignaling, extractVoipCommands } from '../../src/services/client_voip'

const mockConnect = connect as jest.MockedFunction<typeof connect>

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const event = (event, _callback) => {
  logger.info('subscribe event: %s', event)
}

const onNewLogin = async (phone: string) => {
  logger.info('New login %s', phone)
}

describe('service client baileys', () => {
  let client: Client
  let phone: string
  let listener: Listener
  let incoming: Incoming
  let store: Store
  let dataStore: DataStore
  let sessionStore: SessionStore
  let send
  let read
  let logout
  let exists
  let rejectCall
  let sendCallNodeMock
  let fetchImageUrl
  let fetchGroupMetadata
  let getConfig: getConfig
  let config: Config
  let close: close
  let eventHandlers: Record<string, Function>

  const status: Status = { attempt: 0 }

  beforeEach(async () => {
    mockConnect.mockReset()
    ;(sendVoipCallEvent as jest.Mock).mockClear()
    ;(sendVoipSignaling as jest.Mock).mockClear()
    ;(extractVoipCommands as jest.Mock).mockReset()
    ;(extractVoipCommands as jest.Mock).mockImplementation(() => [])
    phone = `${new Date().getMilliseconds()}`
    listener = mock<Listener>()
    incoming = mock<Incoming>()
    dataStore = mock<DataStore>()
    dataStore.loadUnoId.mockImplementation(async (id: string) => `uno-${id}`)
    sessionStore = mock<SessionStore>()
    close = mockFn<close>()
    store = mock<Store>()
    store.dataStore = dataStore
    store.sessionStore = sessionStore
    config = defaultConfig
    config.ignoreGroupMessages = true
    eventHandlers = {}
    getConfig = async (_phone: string) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      config.getStore = async (_phone: string) => {
        return store
      }
      return config
    }
    client = new ClientBaileys(phone, listener, getConfig, onNewLogin)
    send = mockFn<sendMessage>()
    read = mockFn<readMessages>().mockResolvedValue(true)
    exists = mockFn<exists>()
    rejectCall = mockFn<rejectCall>()
    sendCallNodeMock = mockFn<sendCallNode>().mockResolvedValue(undefined)
    logout = mockFn<logout>()
    fetchImageUrl = mockFn<fetchImageUrl>()
    fetchGroupMetadata = mockFn<fetchGroupMetadata>()
    const capturedEvent = (name, callback) => {
      eventHandlers[name] = callback
      return event(name, callback)
    }
    mockConnect.mockResolvedValue({ event: capturedEvent as any, status, send, read, rejectCall, sendCallNode: sendCallNodeMock, fetchImageUrl, fetchGroupMetadata, exists, close, logout })
  })

  test('call send with unknown status', async () => {
    const status = `${new Date().getMilliseconds()}`
    try {
      await client.send({ status }, {})
      expect(true).toBe(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      expect(e.message).toBe(`Unknow message status ${status}`)
    }
  })

  test('call send with read status', async () => {
    const loadKey = jest.spyOn(store?.dataStore, 'loadKey')
    loadKey.mockReturnValue(new Promise((resolve) => resolve({ id: `${new Date().getMilliseconds()}` })))
    await client.connect(0)
    const response: Response = await client.send({ status: 'read', to: `${new Date().getMilliseconds()}` }, {})
    expect(loadKey).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(response.ok).toStrictEqual({ success: true })
  })

  test('call send with message text success', async () => {
    const anyMessage: Promise<proto.WebMessageInfo> = mock<Promise<proto.WebMessageInfo>>()
    send.mockReturnValue(anyMessage)
    const to = '5566996923653'
    const id = `${new Date().getMilliseconds()}`
    send.mockResolvedValue({ key: { id } })
    const payload = { to, type: 'text', text: { body: `${new Date().getMilliseconds()}` } }
    await client.connect(0)
    const response: Response = await client.send(payload, {})
    expect(send).toHaveBeenCalledTimes(1)
    expect(response.ok.messages[0].id).toBe(`uno-${id}`)
  })

  test('call send with message type unknown', async () => {
    const type = `${new Date().getMilliseconds()}`
    try {
      await client.connect(0)
      await client.send({ type }, {})
      expect(true).toBe(false)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      expect(e.message).toBe(`Unknow message type ${type}`)
    }
  })

  test('call send with error', async () => {
    const payload = { to: `${new Date().getMilliseconds()}`, type: 'text', text: { body: `${new Date().getMilliseconds()}` } }
    send = async () => {
      throw new SendError(1, '')
    }
    mockConnect.mockResolvedValue({ event, status, send, read, rejectCall, sendCallNode: sendCallNodeMock, fetchImageUrl, fetchGroupMetadata, exists, close, logout })
    await client.connect(0)
    const response = await client.send(payload, {})
    expect(response.error.entry.length).toBe(1)
  })

  test('retry stale send once after reconnect without duplicating first attempt', async () => {
    const to = `${new Date().getMilliseconds()}`
    const payload = { to, type: 'text', text: { body: 'retry after reconnect' } }
    const firstSend = mockFn<sendMessage>().mockRejectedValue({
      message: 'Send failed due to stale connection; safe to retry after reconnect',
      data: {
        retryAfterReconnect: true,
        retriable: true,
        retryableSend: {
          targetJid: `${to}@s.whatsapp.net`,
          fullMessage: {
            message: {
              conversation: 'retry after reconnect',
            },
          },
          relayOptions: {
            messageId: 'retryable-msg-id',
          },
        },
      },
    })
    const secondSend = mockFn<sendMessage>().mockResolvedValue({
      key: { id: 'resent-id', remoteJid: `${to}@s.whatsapp.net` },
      message: { conversation: 'retry after reconnect' },
    } as any)
    const firstClose = mockFn<close>()
    const secondClose = mockFn<close>()
    mockConnect
      .mockResolvedValueOnce({ event, status, send: firstSend, read, rejectCall, sendCallNode: sendCallNodeMock, fetchImageUrl, fetchGroupMetadata, exists, close: firstClose, logout })
      .mockResolvedValueOnce({ event, status, send: secondSend, read, rejectCall, sendCallNode: sendCallNodeMock, fetchImageUrl, fetchGroupMetadata, exists, close: secondClose, logout })

    await client.connect(0)
    const response: Response = await client.send(payload, {})

    expect(firstSend).toHaveBeenCalledTimes(1)
    expect(firstClose).toHaveBeenCalledTimes(1)
    expect(mockConnect).toHaveBeenCalledTimes(2)
    expect(secondSend).toHaveBeenCalledTimes(1)
    expect(secondSend).toHaveBeenCalledWith(
      `${to}@s.whatsapp.net`,
      { conversation: 'retry after reconnect' },
      expect.objectContaining({
        messageId: 'retryable-msg-id',
        __staleReconnectRetried: true,
      }),
    )
    expect(response.ok.messages[0].id).toBe('uno-resent-id')
  })

  test('call disconnect', async () => {
    await client.disconnect()
    expect(dataStores.size).toBe(0)
  })

  test('call send with audio mp3 converts to ogg ptt', async () => {
    const anyMessage: Promise<proto.WebMessageInfo> = mock<Promise<proto.WebMessageInfo>>()
    const id = `${new Date().getMilliseconds()}`
    // Intercept send to assert transformed content
    ;(send as jest.MockedFunction<any>).mockImplementation(async (_to, message, _opts) => {
      expect(Buffer.isBuffer(message.audio)).toBe(true)
      expect(message.ptt).toBe(true)
      expect(message.mimetype).toBe('audio/ogg; codecs=opus')
      return { key: { id } }
    })
    const to = `${new Date().getMilliseconds()}`
    const payload = { to, type: 'audio', audio: { link: `http://example.com/test.mp3` } }
    await client.connect(0)
    const response: Response = await client.send(payload, {})
    expect(send).toHaveBeenCalledTimes(1)
    expect(response.ok.messages[0].id).toBe(`uno-${id}`)
  })

  test('call ringing rejects using callerPn when available', async () => {
    config.rejectCalls = 'Nao posso atender agora'
    await client.connect(0)

    await eventHandlers.call?.([
      {
        from: '123456789012345@lid',
        callerPn: '556696923653@s.whatsapp.net',
        id: 'call-1',
        status: 'ringing',
      },
    ])

    expect(rejectCall).toHaveBeenCalledWith('call-1', '123456789012345@lid')
    expect(send).toHaveBeenCalledWith('556696923653@s.whatsapp.net', { text: config.rejectCalls }, {})
  })

  test('call ringing falls back to from when callerPn is absent', async () => {
    config.rejectCalls = 'Nao posso atender agora'
    await client.connect(0)

    await eventHandlers.call?.([
      {
        from: '5566996923653@s.whatsapp.net',
        id: 'call-2',
        status: 'ringing',
      },
    ])

    expect(rejectCall).toHaveBeenCalledWith('call-2', '5566996923653@s.whatsapp.net')
  })

  test('call event notifies voip service when status maps', async () => {
    await client.connect(0)

    await eventHandlers.call?.([
      {
        from: '123456789012345@lid',
        callerPn: '556696923653@s.whatsapp.net',
        id: 'call-3',
        status: 'ringing',
        isVideo: true,
        timestamp: 1774650364,
      },
    ])

    expect(sendVoipCallEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        session: phone,
        event: 'incoming_call',
        callId: 'call-3',
        from: '123456789012345@lid',
        callerPn: '556696923653@s.whatsapp.net',
        isVideo: true,
        timestamp: 1774650364,
      }),
    )
  })

  test('call event processes send_call_node commands from voip service', async () => {
    ;(sendVoipCallEvent as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        commands: [
          {
            action: 'send_call_node',
            session: phone,
            callId: 'call-4',
            peerJid: '123456789012345@lid',
            payloadTag: 'call',
            payloadBase64: Buffer.from('<offer call-id="call-4" call-creator="123456789012345@lid"/>').toString('base64'),
          },
        ],
      },
    })
    ;(extractVoipCommands as jest.Mock).mockImplementation((body: any) => body.commands)

    await client.connect(0)
    await eventHandlers.call?.([
      {
        from: '123456789012345@lid',
        id: 'call-4',
        status: 'ringing',
      },
    ])

    expect(sendCallNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: 'call',
        attrs: expect.objectContaining({ to: '123456789012345@lid' }),
      }),
    )
  })

  test('call event sends exact call stanza generated by voip service when payload already has call root', async () => {
    ;(sendVoipCallEvent as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: {
        commands: [
          {
            action: 'send_call_node',
            session: phone,
            callId: 'call-6',
            peerJid: 'ignored@lid',
            payloadTag: 'call',
            payloadBase64: Buffer.from('<call from="self@s.whatsapp.net" to="999@lid"><offer call-id="call-6" call-creator="999@lid"/></call>').toString('base64'),
          },
        ],
      },
    })
    ;(extractVoipCommands as jest.Mock).mockImplementation((body: any) => body.commands)

    await client.connect(0)
    await eventHandlers.call?.([
      {
        from: '123456789012345@lid',
        id: 'call-6',
        status: 'ringing',
      },
    ])

    expect(sendCallNodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: 'call',
        attrs: expect.objectContaining({
          from: 'self@s.whatsapp.net',
          to: '999@lid',
        }),
      }),
    )
  })

  test('raw call node forwards signaling to voip service', async () => {
    await client.connect(0)

    await eventHandlers['call.raw']?.({
      tag: 'call',
      attrs: {
        from: '120363000000@g.us',
        t: '1774650364',
      },
      content: [
        {
          tag: 'offer',
          attrs: {
            'call-id': 'call-5',
            from: '123456789012345@lid',
            'call-creator': '123456789012345@lid',
          },
          content: undefined,
        },
      ],
    })

    expect(sendVoipSignaling).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        session: phone,
        callId: 'call-5',
        peerJid: '123456789012345@lid',
        msgType: 'offer',
        payloadBase64: expect.any(String),
        payloadEncoding: 'wa_binary',
      }),
    )
  })
})
