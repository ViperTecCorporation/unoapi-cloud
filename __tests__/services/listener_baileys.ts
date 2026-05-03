import { mock } from 'jest-mock-extended'
import { Store, getStore } from '../../src/services/store'
import { DataStore } from '../../src/services/data_store'
import { MediaStore } from '../../src/services/media_store'
import { Config, getConfig, defaultConfig, getMessageMetadataDefault } from '../../src/services/config'
import { ListenerBaileys } from '../../src/services/listener_baileys'
import { Outgoing } from '../../src/services/outgoing'
import { Broadcast } from '../../src/services/broadcast'

jest.mock('../../src/services/redis', () => ({
  getPollState: jest.fn().mockResolvedValue(undefined),
  setPollState: jest.fn().mockResolvedValue(undefined),
  getStatusMediaState: jest.fn().mockResolvedValue(undefined),
  setStatusMediaState: jest.fn().mockResolvedValue(undefined),
  getUnoIdsForProviderAnySession: jest.fn().mockResolvedValue([]),
}))

let store: Store
let getConfig: getConfig
let config: Config
let getStore: getStore
let phone
let outgoing: Outgoing
let service: ListenerBaileys
let broadcast: Broadcast

const textPayload = {
  key: {
    remoteJid: 'askjhasd@kslkjasd.xom',
    fromMe: false,
    id: 'kasjhdkjhasjkshad',
  },
  message: {
    conversation: 'skdfkdshf',
  },
}

describe('service listener baileys', () => {
  beforeEach(() => {
    config = defaultConfig
    config.ignoreGroupMessages = true
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getStore = async (_phone: string): Promise<Store> => store
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getConfig = async (_phone: string) => {
      config.getStore = getStore
      config.getMessageMetadata = getMessageMetadataDefault
      return config
    }
    store = mock<Store>()
    broadcast = mock<Broadcast>()
    outgoing = mock<Outgoing>()
    store.dataStore = mock<DataStore>()
    store.mediaStore = mock<MediaStore>()
    phone = `${new Date().getMilliseconds()}`
    service = new ListenerBaileys(outgoing, broadcast, getConfig)
  })

  test('send call sendOne when text', async () => {
    const func = jest.spyOn(service, 'sendOne')
    await service.process(phone, [textPayload], 'notify')
    expect(func).toHaveBeenCalledTimes(1)
  })

  test('stores original Baileys id even when metadata normalizer changes the webhook id', async () => {
    const providerId = 'provider-original-message'
    const normalizedId = 'uno-normalized-message'
    config.getMessageMetadata = async message => ({
      ...message,
      key: {
        ...message['key'],
        id: normalizedId,
      },
    })

    await service.sendOne(phone, {
      key: {
        remoteJid: '556699999999@s.whatsapp.net',
        fromMe: false,
        id: providerId,
      },
      message: {
        conversation: 'Mensagem normal',
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
    })

    expect(store.dataStore.setUnoId).toHaveBeenCalledWith(providerId, expect.any(String))
    expect(store.dataStore.setKey).toHaveBeenCalledWith(providerId, expect.objectContaining({ id: providerId }))
    expect(store.dataStore.setMessage).toHaveBeenCalledWith(
      '556699999999@s.whatsapp.net',
      expect.objectContaining({
        key: expect.objectContaining({ id: providerId }),
      }),
    )
    expect(store.dataStore.setUnoId).not.toHaveBeenCalledWith(normalizedId, expect.any(String))
    expect(outgoing.send).toHaveBeenCalledWith(
      phone,
      expect.objectContaining({
        entry: expect.any(Array),
      }),
    )
  })

  test('normalizes message edit context to Uno id before sending webhook', async () => {
    const providerId = 'provider-original-message'
    const unoId = 'uno-original-message'
    store.dataStore.loadUnoId.mockImplementation(async (id: string) => (id === providerId ? unoId : undefined))

    await service.sendOne(phone, {
      key: {
        remoteJid: '556699999999@s.whatsapp.net',
        fromMe: false,
        id: 'provider-edit-event',
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      update: {
        message: {
          protocolMessage: {
            key: {
              remoteJid: '556699999999@s.whatsapp.net',
              fromMe: false,
              id: providerId,
            },
            type: 'MESSAGE_EDIT',
            editedMessage: {
              conversation: 'Mensagem editada',
            },
            timestampMs: `${Date.now()}`,
          },
        },
      },
    })

    expect(outgoing.send).toHaveBeenCalledWith(
      phone,
      expect.objectContaining({
        entry: expect.arrayContaining([
          expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                value: expect.objectContaining({
                  messages: expect.arrayContaining([
                    expect.objectContaining({
                      message_type: 'message_edit',
                      context: {
                        message_id: unoId,
                        id: unoId,
                      },
                    }),
                  ]),
                }),
              }),
            ]),
          }),
        ]),
      }),
    )
  })
})
