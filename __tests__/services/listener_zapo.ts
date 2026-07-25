import { mock } from 'jest-mock-extended'
import type { Broadcast } from '../../src/services/broadcast'
import { defaultConfig, type Config } from '../../src/services/config'
import type { DataStore } from '../../src/services/data_store'
import { ListenerZapo } from '../../src/services/listener_zapo'
import type { MediaStore } from '../../src/services/media_store'
import type { Outgoing } from '../../src/services/outgoing'
import type { Store } from '../../src/services/store'

describe('ListenerZapo', () => {
  let config: Config
  let store: Store
  let outgoing: Outgoing
  let service: ListenerZapo

  beforeEach(() => {
    store = mock<Store>()
    store.dataStore = mock<DataStore>()
    store.mediaStore = mock<MediaStore>()
    ;(store.dataStore.setUnoId as jest.Mock).mockImplementation(async (_providerId: string, unoId: string) => unoId)
    outgoing = mock<Outgoing>()
    config = { ...defaultConfig, provider: 'zapo', getStore: jest.fn().mockResolvedValue(store) }
    service = new ListenerZapo(outgoing, mock<Broadcast>(), async () => config)
  })

  test('maps the official Zapo id to an external Uno id and forwards the webhook', async () => {
    await service.process('5566999999999', [{
      key: {
        id: '3EB0ZAPO',
        remoteJid: '123@lid',
        remoteJidAlt: '5566998888888@s.whatsapp.net',
        senderUsername: 'maria',
        fromMe: false,
      },
      message: { conversation: 'oi' },
      messageTimestamp: 1,
      pushName: 'Maria',
    }], 'notify')

    expect(store.dataStore.setUnoId).toHaveBeenCalledWith('3EB0ZAPO', expect.any(String))
    expect(store.dataStore.setKey).toHaveBeenCalledWith('3EB0ZAPO', expect.objectContaining({ id: '3EB0ZAPO' }))
    expect(store.dataStore.setLastIncomingKey).toHaveBeenCalledWith(
      '5566998888888@s.whatsapp.net',
      expect.objectContaining({ id: expect.any(String) }),
    )
    const payload: any = (outgoing.send as jest.Mock).mock.calls[0][1]
    expect(payload.entry[0].changes[0].value.messages[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(payload.entry[0].changes[0].value.messages[0].id).not.toBe('3EB0ZAPO')
  })

  test.each([
    ['direct', { remoteJid: '123@lid', remoteJidAlt: '5566998888888@s.whatsapp.net' }],
    ['group', {
      remoteJid: '120363427999345040@g.us',
      participant: '123@lid',
      participantAlt: '5566998888888@s.whatsapp.net',
      isGroup: true,
    }],
  ])('uses the Uno id for %s media storage and webhook references', async (_kind, key) => {
    config.getMessageMetadata = jest.fn(async (message: any) => ({
      ...message,
      __unoapiMediaBytes: Buffer.from([1, 2, 3]),
    }))
    ;(store.mediaStore.saveDownloadedMedia as jest.Mock).mockImplementation(async (message: any) => ({
      ...message,
      message: {
        ...message.message,
        imageMessage: {
          ...message.message.imageMessage,
          url: `https://files.example/${message.key.id}.jpg`,
        },
      },
    }))

    await service.process('5566999999999', [{
      key: { id: '3EB0MEDIA', fromMe: false, ...key },
      message: { imageMessage: { mimetype: 'image/jpeg' } },
      messageTimestamp: 1,
    }], 'notify')

    const storedMessage = (store.mediaStore.saveDownloadedMedia as jest.Mock).mock.calls[0][0]
    const payload: any = (outgoing.send as jest.Mock).mock.calls[0][1]
    const webhookMessage = payload.entry[0].changes[0].value.messages[0]

    expect(storedMessage.key.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(webhookMessage.id).toBe(storedMessage.key.id)
    expect(webhookMessage.image.id).toBe(`5566999999999/${storedMessage.key.id}`)
    expect(webhookMessage.image.url).toContain(storedMessage.key.id)
  })

  test('does not expose temporary WhatsApp media when Zapo bytes are unavailable', async () => {
    await expect(service.process('5566999999999', [{
      key: {
        id: '3EB0MEDIAFALLBACK',
        remoteJid: '123@lid',
        remoteJidAlt: '5566998888888@s.whatsapp.net',
        fromMe: true,
      },
      message: { imageMessage: { mimetype: 'image/jpeg', directPath: '/media' } },
      messageTimestamp: 1,
    }], 'notify')).rejects.toThrow('zapo_media_bytes_unavailable')
    expect(store.mediaStore.saveMedia).not.toHaveBeenCalled()
    expect(outgoing.send).not.toHaveBeenCalled()
  })

  test('normalizes a legacy Brazilian mobile PN only at the Zapo webhook boundary', async () => {
    await service.process('5566999999999', [{
      key: {
        id: 'legacy-mobile',
        remoteJid: '123@lid',
        remoteJidAlt: '556699554300@s.whatsapp.net',
        fromMe: false,
      },
      message: { conversation: 'oi' },
      messageTimestamp: 1,
    }], 'notify')

    const payload: any = (outgoing.send as jest.Mock).mock.calls[0][1]
    const value = payload.entry[0].changes[0].value
    expect(value.contacts[0]).toEqual(expect.objectContaining({
      wa_id: '5566999554300',
      user_id: '123@lid',
    }))
    expect(value.messages[0]).toEqual(expect.objectContaining({
      from: '5566999554300',
      from_user_id: '123@lid',
    }))
  })

  test('normalizes a legacy Brazilian mobile group sender without replacing its LID', async () => {
    await service.process('5566999999999', [{
      key: {
        id: 'legacy-group-mobile',
        remoteJid: '120363427999345040@g.us',
        participant: '456@lid',
        participantAlt: '556699554300@s.whatsapp.net',
        fromMe: false,
        isGroup: true,
      },
      message: { conversation: 'grupo' },
      messageTimestamp: 1,
    }], 'notify')

    const payload: any = (outgoing.send as jest.Mock).mock.calls[0][1]
    const value = payload.entry[0].changes[0].value
    expect(value.contacts[0]).toEqual(expect.objectContaining({
      wa_id: '5566999554300',
      user_id: '456@lid',
      group_id: '120363427999345040@g.us',
    }))
    expect(value.messages[0]).toEqual(expect.objectContaining({
      from: '5566999554300',
      from_user_id: '456@lid',
    }))
  })

  test('keeps a Brazilian landline unchanged in the Zapo webhook', async () => {
    await service.process('5566999999999', [{
      key: {
        id: 'landline',
        remoteJid: '789@lid',
        remoteJidAlt: '556635211234@s.whatsapp.net',
        fromMe: false,
      },
      message: { conversation: 'fixo' },
      messageTimestamp: 1,
    }], 'notify')

    const payload: any = (outgoing.send as jest.Mock).mock.calls[0][1]
    const value = payload.entry[0].changes[0].value
    expect(value.contacts[0].wa_id).toBe('556635211234')
    expect(value.messages[0].from).toBe('556635211234')
  })

  test('deduplicates repeated provider events', async () => {
    const event = {
      key: { id: 'same', remoteJid: '123@lid', fromMe: false },
      message: { conversation: 'oi' },
      messageTimestamp: 1,
    }
    await service.process('5566999999999', [event], 'notify')
    await service.process('5566999999999', [event], 'notify')
    expect(outgoing.send).toHaveBeenCalledTimes(1)
  })

  test('does not deduplicate the same group event across different sessions', async () => {
    const event = {
      key: {
        id: 'shared-group-message',
        remoteJid: '120363427999345040@g.us',
        participant: '86110369755163@lid',
        fromMe: true,
        isGroup: true,
      },
      message: { conversation: 'eco enviado pelo aparelho' },
      messageTimestamp: 1,
    }

    await service.process('5566996269251', [event], 'notify')
    await service.process('5566996328386', [event], 'notify')

    expect(outgoing.send).toHaveBeenCalledTimes(2)
    expect(outgoing.send).toHaveBeenNthCalledWith(1, '5566996269251', expect.any(Object))
    expect(outgoing.send).toHaveBeenNthCalledWith(2, '5566996328386', expect.any(Object))
  })

  test('does not let a group sender-key event suppress the message with the same provider id', async () => {
    const key = {
      id: 'same-group-id',
      remoteJid: '120363427999345040@g.us',
      participant: '86110369755163@lid',
      participantAlt: '5566996328386@s.whatsapp.net',
      fromMe: true,
      isGroup: true,
    }

    await service.process('5566996328386', [{
      key,
      message: { senderKeyDistributionMessage: { groupId: key.remoteJid } },
      messageTimestamp: 1,
    }], 'notify')
    await service.process('5566996328386', [{
      key,
      message: { conversation: 'grupo aparelho depois patch' },
      messageTimestamp: 1,
    }], 'notify')

    expect(outgoing.send).toHaveBeenCalledTimes(1)
    expect(outgoing.send).toHaveBeenCalledWith('5566996328386', expect.objectContaining({
      entry: [expect.objectContaining({
        changes: [expect.objectContaining({
          value: expect.objectContaining({
            messages: [expect.objectContaining({
              text: { body: 'grupo aparelho depois patch' },
              group_id: key.remoteJid,
            })],
          }),
        })],
      })],
    }))
  })

  test('maps an incoming poll vote context from the Zapo id to the parent Uno id', async () => {
    ;(store.dataStore.loadUnoId as jest.Mock).mockImplementation(async (id: string) => (
      id === 'poll-provider-id' ? 'poll-uno-id' : undefined
    ))

    await service.process('5566996328386', [{
      key: {
        id: 'vote-provider-id',
        remoteJid: '120363427999345040@g.us',
        participant: '86110369755163@lid',
        fromMe: false,
      },
      message: {
        pollUpdateMessage: {
          pollCreationMessageKey: {
            id: 'poll-provider-id',
            remoteJid: '120363427999345040@g.us',
            fromMe: false,
          },
          vote: { selectedOptionNames: ['Pizza'] },
        },
      },
      messageTimestamp: 1,
    }], 'notify')

    expect(outgoing.send).toHaveBeenCalledWith('5566996328386', expect.objectContaining({
      entry: [expect.objectContaining({
        changes: [expect.objectContaining({
          value: expect.objectContaining({
            messages: [expect.objectContaining({
              text: { body: '*Voto em enquete*: Pizza' },
              context: { message_id: 'poll-uno-id', id: 'poll-uno-id' },
            })],
          }),
        })],
      })],
    }))
  })

  test('maps receipt ids and suppresses status regression', async () => {
    ;(store.dataStore.loadUnoId as jest.Mock).mockResolvedValue('uno-1')
    ;(store.dataStore.loadStatus as jest.Mock).mockResolvedValue('read')
    await service.process('5566999999999', [{
      key: { id: 'provider-1', remoteJid: '123@lid', fromMe: true },
      update: { status: 'DELIVERY_ACK' },
    }], 'update')
    expect(outgoing.send).not.toHaveBeenCalled()
  })

  test('forwards receipt and persists progression with the associated Uno id', async () => {
    ;(store.dataStore.loadUnoId as jest.Mock).mockResolvedValue('uno-1')
    ;(store.dataStore.loadStatus as jest.Mock).mockResolvedValue(undefined)
    await service.process('5566999999999', [{
      key: { id: '3EB0PROVIDER', remoteJid: '123@lid', fromMe: true },
      update: { status: 'READ' },
    }], 'update')

    expect(outgoing.send).toHaveBeenCalledWith(
      '5566999999999',
      expect.objectContaining({
        entry: [expect.objectContaining({
          changes: [expect.objectContaining({
            value: expect.objectContaining({
              statuses: [expect.objectContaining({ id: 'uno-1', status: 'read' })],
            }),
          })],
        })],
      }),
    )
    expect(store.dataStore.setStatus).toHaveBeenCalledWith('uno-1', 'read')
  })
})
