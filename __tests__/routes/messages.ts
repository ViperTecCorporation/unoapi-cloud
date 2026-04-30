import request from 'supertest'
import { mock } from 'jest-mock-extended'

import { App } from '../../src/app'
import { Incoming } from '../../src/services/incoming'
import { Outgoing } from '../../src/services/outgoing'
import { defaultConfig, getConfig } from '../../src/services/config'
import { Response } from '../../src/services/response'
import { getStore, Store } from '../../src/services/store'
import { SessionStore } from '../../src/services/session_store'
import { OnNewLogin } from '../../src/services/socket'
import { addToBlacklist } from '../../src/services/blacklist'
import { Reload } from '../../src/services/reload'
import { Logout } from '../../src/services/logout'

jest.mock('../../src/services/rate_limit', () => ({
  allowSend: jest.fn().mockResolvedValue({ allowed: true }),
}))

const addToBlacklist = mock<addToBlacklist>()

const sessionStore = mock<SessionStore>()
const store = mock<Store>()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getConfigTest: getConfig = async (_phone: string) => {
  defaultConfig.getStore = getTestStore
  return defaultConfig
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTestStore: getStore = async (_phone: string, _config: object) => {
  return store
}

let phone: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let json: any
let app: App
let incoming: Incoming
let outgoing: Outgoing

describe('messages routes', () => {
  beforeEach(() => {
    phone = `${new Date().getTime()}`
    json = { data: `${new Date().getTime()}` }
    outgoing = mock<Outgoing>()
    incoming = mock<Incoming>()
    const onNewLogin = mock<OnNewLogin>()
    const reload = mock<Reload>()
    const logout = mock<Logout>()
    app = new App(incoming, outgoing, '', getConfigTest, sessionStore, onNewLogin, addToBlacklist, reload, logout)
  })

  test('whatsapp with sucess', async () => {
    const sendSpy = jest.spyOn(incoming, 'send')
    const r: Response = { ok: { any: '1' } }
    const p: Promise<Response> = new Promise((resolve) => resolve(r))
    jest.spyOn(incoming, 'send').mockReturnValue(p)
    const res = await request(app.server).post(`/v15.0/${phone}/messages`).send(json)
    expect(res.status).toEqual(200)
    expect(sendSpy).toHaveBeenCalledWith(
      phone,
      expect.objectContaining({
        ...json,
        _requestId: expect.any(String),
      }),
      expect.objectContaining({
        endpoint: 'messages',
        requestId: expect.any(String),
      }),
    )
  })

  test('normalizes raw Baileys interactive payload before sending', async () => {
    const sendSpy = jest.spyOn(incoming, 'send')
    const r: Response = { ok: { success: true } }
    jest.spyOn(incoming, 'send').mockResolvedValue(r)
    const raw = {
      jid: '5511999999999@s.whatsapp.net',
      message: {
        text: 'Escolha uma opcao:',
        buttons: [
          {
            buttonId: 'opcao_1',
            buttonText: { displayText: 'Opcao 1' },
            type: 1,
          },
        ],
      },
    }

    const res = await request(app.server).post(`/v15.0/${phone}/messages`).send(raw)

    expect(res.status).toEqual(200)
    expect(sendSpy).toHaveBeenCalledWith(
      phone,
      expect.objectContaining({
        ...raw,
        to: raw.jid,
        type: 'baileys',
        _requestId: expect.any(String),
      }),
      expect.objectContaining({
        endpoint: 'messages',
        requestId: expect.any(String),
      }),
    )
  })

  test('accepts Graph-like phone_number_id messages route', async () => {
    const sendSpy = jest.spyOn(incoming, 'send')
    const r: Response = { ok: { success: true } }
    jest.spyOn(incoming, 'send').mockResolvedValue(r)
    const phoneNumberId = `phone-id-${new Date().getTime()}`

    const res = await request(app.server).post(`/v19.0/${phoneNumberId}/messages`).send({
      messaging_product: 'whatsapp',
      to: '5566999999999',
      type: 'text',
      text: { body: 'teste' },
    })

    expect(res.status).toEqual(200)
    expect(sendSpy).toHaveBeenCalledWith(
      phoneNumberId,
      expect.objectContaining({
        type: 'text',
        _requestId: expect.any(String),
      }),
      expect.objectContaining({ endpoint: 'messages' }),
    )
  })

  test('delivery recovery route forces session refresh for the original message id', async () => {
    const recoverSpy = jest.spyOn(incoming, 'recoverDelivery').mockResolvedValue({
      ok: {
        messaging_product: 'whatsapp',
        messages: [{ id: 'uno-message-1' }],
        recovery: { attempted: true },
      },
    } as any)

    const res = await request(app.server)
      .post(`/v19.0/${phone}/messages/uno-message-1/recover_delivery`)
      .send({
        to: '5566996810064',
        type: 'text',
        text: { body: 'reenviar agora' },
      })

    expect(res.status).toEqual(200)
    expect(recoverSpy).toHaveBeenCalledWith(
      phone,
      expect.objectContaining({
        message_id: 'uno-message-1',
        to: '5566996810064',
        type: 'text',
        _requestId: expect.any(String),
      }),
      expect.objectContaining({
        endpoint: 'messages',
        forceDeliveryRecovery: true,
        forceSessionRefresh: true,
        forceDeviceList: true,
        useUserDevicesCache: false,
      }),
    )
  })

  test('whatsapp with 400 status', async () => {
    jest.spyOn(incoming, 'send').mockRejectedValue(new Error('cannot login'))
    const res = await request(app.server).post(`/v15.0/${phone}/messages`).send(json)
    expect(res.status).toEqual(400)
  })

  test('whatsapp with error', async () => {
    const response: Response = {
      error: { code: 1, title: 'humm' },
      ok: { o: 'skjdh' },
    }
    const p: Promise<Response> = new Promise((resolve) => resolve(response))
    jest.spyOn(incoming, 'send').mockReturnValue(p)
    const sendSpy = jest.spyOn(outgoing, 'send')
    const res = await request(app.server).post(`/v15.0/${phone}/messages`).send(json)
    expect(sendSpy).toHaveBeenCalledWith(phone, response.error)
    expect(res.status).toEqual(200)
  })
})
