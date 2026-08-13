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

  test('uses an exact cached PN to LID mapping without querying the network', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockResolvedValue({
      jid: '1100316999680@lid',
      lid: '1100316999680@lid',
      phoneNumber: '5566996890270',
    } as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('5566996890270')).resolves.toBe('1100316999680@lid')
    expect(store.contacts.getByPhoneNumber).toHaveBeenCalledWith('5566996890270')
    expect(client.profile.getLidsByPhoneNumbers).not.toHaveBeenCalled()
    expect(store.contacts.upsertBatch).not.toHaveBeenCalled()
  })

  test('falls back to the cached Brazilian PN without the ninth digit after an exact cache miss', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockImplementation(async (phone) => (
      phone === '556699554300'
        ? {
            jid: '1100316999680@lid',
            lid: '1100316999680@lid',
            phoneNumber: '556699554300',
            lastUpdatedMs: 1,
          } as never
        : null
    ))
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('5566999554300')).resolves.toBe('1100316999680@lid')
    expect(store.contacts.getByPhoneNumber).toHaveBeenNthCalledWith(1, '5566999554300')
    expect(store.contacts.getByPhoneNumber).toHaveBeenNthCalledWith(2, '5566999554300@s.whatsapp.net')
    expect(store.contacts.getByPhoneNumber).toHaveBeenNthCalledWith(3, '556699554300')
    expect(client.profile.getLidsByPhoneNumbers).not.toHaveBeenCalled()
  })

  test('keeps the exact Brazilian PN mapping ahead of the no-ninth-digit fallback', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockImplementation(async (phone) => {
      if (phone === '5566999554300') {
        return { jid: 'exact@lid', lid: '111@lid', phoneNumber: phone, lastUpdatedMs: 1 } as never
      }
      if (phone === '556699554300') {
        return { jid: 'alternate@lid', lid: '222@lid', phoneNumber: phone, lastUpdatedMs: 1 } as never
      }
      return null
    })
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('5566999554300')).resolves.toBe('111@lid')
    expect(store.contacts.getByPhoneNumber).toHaveBeenCalledTimes(1)
    expect(store.contacts.getByPhoneNumber).not.toHaveBeenCalledWith('556699554300')
    expect(client.profile.getLidsByPhoneNumbers).not.toHaveBeenCalled()
  })

  test('does not create a no-ninth-digit fallback for international phones', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockResolvedValue(null)
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([{
      queriedJid: '12025550123@s.whatsapp.net',
      phoneJid: '12025550123@s.whatsapp.net',
      lidJid: '333@lid',
      exists: true,
    }] as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('12025550123')).resolves.toBe('333@lid')
    expect(store.contacts.getByPhoneNumber).toHaveBeenCalledTimes(2)
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledWith(['12025550123@s.whatsapp.net'])
  })

  test('refreshes a phone LID strictly from the network and persists the canonical result', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockResolvedValue({
      jid: '43731474477087@lid',
      lid: '43731474477087@lid',
      phoneNumber: '5566999810771',
    } as never)
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([{
      queriedJid: '5566999810771@s.whatsapp.net',
      phoneJid: '5566999810771@s.whatsapp.net',
      lidJid: '98765432100000@lid',
      exists: true,
    }] as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.refreshPhoneLid('5566999810771')).resolves.toEqual({
      phoneJid: '5566999810771@s.whatsapp.net',
      lidJid: '98765432100000@lid',
    })
    expect(store.contacts.getByPhoneNumber).not.toHaveBeenCalled()
    expect(store.contacts.upsert).toHaveBeenCalledWith(expect.objectContaining({
      jid: '98765432100000@lid',
      lid: '98765432100000@lid',
      phoneNumber: '5566999810771',
    }))
  })

  test('re-reads the contact store when an unavailable network lookup races with a cache update', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockRejectedValue(new Error('offline'))
    store.contacts.getByPhoneNumber
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        jid: '273877414502425@lid',
        lid: '273877414502425@lid',
        phoneNumber: '556696890270',
      } as never)
    const identity = new ZapoIdentity(client, store, 'session')

    await expect(identity.resolve('556696890270')).resolves.toBe('273877414502425@lid')
  })

  test('coalesces concurrent cache misses for the same phone into one network lookup', async () => {
    const client = mockDeep<WaClient>()
    const store = mockDeep<WaStoreSession>()
    store.contacts.getByPhoneNumber.mockResolvedValue(null)
    let releaseLookup!: (value: unknown) => void
    client.profile.getLidsByPhoneNumbers.mockReturnValue(new Promise((resolve) => {
      releaseLookup = resolve
    }) as never)
    const identity = new ZapoIdentity(client, store, 'session')

    const first = identity.resolve('5511988887777')
    const second = identity.resolve('5511988887777')
    await Promise.resolve()
    await Promise.resolve()
    releaseLookup([{
      queriedJid: '5511988887777@s.whatsapp.net',
      phoneJid: '5511988887777@s.whatsapp.net',
      lidJid: '987654321@lid',
      exists: true,
    }])

    await expect(Promise.all([first, second])).resolves.toEqual(['987654321@lid', '987654321@lid'])
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledTimes(1)
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
