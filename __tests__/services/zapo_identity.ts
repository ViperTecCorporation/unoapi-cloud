import { mockDeep } from 'jest-mock-extended'
import type { WaClient, WaStoreSession } from 'zapo-js'
import { ZapoIdentity } from '../../src/services/zapo/zapo_identity'
import type { ZapoUsernameIndex } from '../../src/services/zapo/zapo_username_index'

describe('Zapo canonical identity resolver', () => {
  test('uses the official PN to LID lookup and persists the learned alias in the Zapo store', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([
      { exists: true, phoneJid: '5511999999999@s.whatsapp.net', lidJid: '987@lid' },
    ] as never)
    const usernames = { resolve: jest.fn() } as unknown as ZapoUsernameIndex
    const identity = new ZapoIdentity(client, store, 'session', usernames)

    await expect(identity.resolve('5511999999999')).resolves.toBe('987@lid')
    expect(store.contacts.upsertBatch).toHaveBeenCalledWith([
      expect.objectContaining({ jid: '987@lid', phoneNumber: '5511999999999' }),
    ])
  })

  test('uses the canonical PN returned by Zapo instead of the normalized queried PN or stale cache', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockResolvedValue({
      jid: '1100316999680@lid',
      lid: '1100316999680@lid',
      phoneNumber: '5566996890270',
    } as never)
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([{
      queriedJid: '5566996890270@s.whatsapp.net',
      phoneJid: '556696890270@s.whatsapp.net',
      lidJid: '273877414502425@lid',
      exists: true,
      invalid: false,
    }] as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('5566996890270')).resolves.toBe('273877414502425@lid')
    expect(store.contacts.getByPhoneNumber).not.toHaveBeenCalled()
    expect(store.contacts.upsertBatch).toHaveBeenCalledWith([{
      jid: '273877414502425@lid',
      lid: '273877414502425@lid',
      phoneNumber: '556696890270',
      lastUpdatedMs: expect.any(Number),
    }])
  })

  test('falls back to the contact store only when the official lookup is unavailable', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockRejectedValue(new Error('offline'))
    store.contacts.getByPhoneNumber.mockResolvedValue({
      jid: '273877414502425@lid',
      lid: '273877414502425@lid',
      phoneNumber: '556696890270',
    } as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('556696890270')).resolves.toBe('273877414502425@lid')
  })

  test('resolves a learned username to LID without fabricating a phone JID', async () => {
    const usernames = { resolve: jest.fn().mockResolvedValue('555@lid') } as unknown as ZapoUsernameIndex
    const identity = new ZapoIdentity(mockDeep<WaClient>(), mockDeep<WaStoreSession>(), 'session', usernames)

    await expect(identity.resolve('@maria')).resolves.toBe('555@lid')
    expect(usernames.resolve).toHaveBeenCalledWith('session', '@maria')
  })

  test('rejects an unknown username explicitly', async () => {
    const usernames = { resolve: jest.fn().mockResolvedValue(undefined) } as unknown as ZapoUsernameIndex
    const identity = new ZapoIdentity(mockDeep<WaClient>(), mockDeep<WaStoreSession>(), 'session', usernames)

    await expect(identity.resolve('desconhecido')).rejects.toThrow('zapo_username_lid_not_cached')
  })

  test('preserves group JIDs without treating them as usernames', async () => {
    const usernames = { resolve: jest.fn() } as unknown as ZapoUsernameIndex
    const identity = new ZapoIdentity(mockDeep<WaClient>(), mockDeep<WaStoreSession>(), 'session', usernames)

    await expect(identity.resolve('120363409038491818@g.us')).resolves.toBe('120363409038491818@g.us')
    expect(usernames.resolve).not.toHaveBeenCalled()
  })

  test('does not fall back to PN when the canonical LID cannot be resolved', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([{ exists: false, invalid: true }] as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('5511999999999')).rejects.toThrow('zapo_phone_lid_not_found')
  })

  test('resolves LIDs to the canonical stored phone JIDs required by group creation', async () => {
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByJid
      .mockResolvedValueOnce({ jid: '111@lid', lid: '111@lid', phoneNumber: '556697195718@s.whatsapp.net' } as never)
      .mockResolvedValueOnce({ jid: '222@lid', lid: '222@lid', phoneNumber: '556699554300' } as never)
    const identity = new ZapoIdentity(mockDeep<WaClient>(), store, 'session')

    await expect(identity.resolveManyPhoneJids(['111@lid', '222@lid'])).resolves.toEqual([
      '556697195718@s.whatsapp.net',
      '556699554300@s.whatsapp.net',
    ])
  })

  test('rejects group creation when a LID has no canonical phone in the Zapo store', async () => {
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByJid.mockResolvedValue(null)
    const identity = new ZapoIdentity(mockDeep<WaClient>(), store, 'session')

    await expect(identity.resolveManyPhoneJids(['111@lid'])).rejects.toThrow('zapo_lid_phone_not_found: 111')
  })
})
