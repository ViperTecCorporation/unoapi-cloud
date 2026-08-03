import { mockDeep } from 'jest-mock-extended'
import type { WaClient, WaStoreSession } from 'zapo-js'
import { ZapoContactIdentityResolver } from '../../src/services/zapo/zapo_contact_identity'

describe('ZapoContactIdentityResolver', () => {
  test('normalizes inputs and correlates unordered network results by queriedJid', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([
      {
        queriedJid: '12025550123@s.whatsapp.net',
        phoneJid: '12025550123@s.whatsapp.net',
        lidJid: '222@lid',
        exists: true,
        invalid: false,
      },
      {
        queriedJid: '5566999554300@s.whatsapp.net',
        phoneJid: '556699554300@s.whatsapp.net',
        lidJid: '111@lid',
        exists: true,
        invalid: false,
      },
    ] as never)
    const resolver = new ZapoContactIdentityResolver(client, session.contacts, { now: () => 1000 })

    await expect(resolver.resolveMany(['+55 66 9955-4300', '+1 202 555 0123'])).resolves.toEqual([
      expect.objectContaining({
        queried_phone_number: '5566999554300',
        canonical_phone_number: '556699554300',
        public_phone_number: '5566999554300',
        lid_jid: '111@lid',
        source: 'network',
        status: 'valid',
      }),
      expect.objectContaining({
        public_phone_number: '12025550123',
        lid_jid: '222@lid',
        source: 'network',
        status: 'valid',
      }),
    ])
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledTimes(1)
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledWith([
      '5566999554300@s.whatsapp.net',
      '12025550123@s.whatsapp.net',
    ])
    expect(session.contacts.upsertBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ jid: '111@lid', phoneNumber: '556699554300' }),
      expect.objectContaining({ jid: '222@lid', phoneNumber: '12025550123' }),
    ]))
  })

  test('uses a fresh canonical store mapping without querying the network', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    session.contacts.getByPhoneNumber.mockResolvedValue({
      jid: '111@lid',
      lid: '111@lid',
      phoneNumber: '556699554300',
      lastUpdatedMs: 9_900,
    } as never)
    const resolver = new ZapoContactIdentityResolver(client, session.contacts, { now: () => 10_000 })

    await expect(resolver.resolveMany(['5566999554300'])).resolves.toEqual([
      expect.objectContaining({
        public_phone_number: '5566999554300',
        lid_jid: '111@lid',
        source: 'store',
        status: 'valid',
      }),
    ])
    expect(client.profile.getLidsByPhoneNumbers).not.toHaveBeenCalled()
  })

  test('falls back to a stale store mapping after one transient network failure', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    const stored = {
      jid: '111@lid',
      lid: '111@lid',
      phoneNumber: '556699554300',
      lastUpdatedMs: 1,
    }
    session.contacts.getByPhoneNumber.mockResolvedValue(stored as never)
    client.profile.getLidsByPhoneNumbers.mockRejectedValue(new Error('timeout'))
    const resolver = new ZapoContactIdentityResolver(client, session.contacts, { now: () => 10_000, freshnessMs: 100 })

    await expect(resolver.resolveMany(['5566999554300'])).resolves.toEqual([
      expect.objectContaining({ lid_jid: '111@lid', source: 'store', status: 'valid' }),
    ])
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledTimes(1)
  })

  test('returns a retryable 503 after one failed lookup without a store fallback', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockRejectedValue(new Error('timeout'))
    const resolver = new ZapoContactIdentityResolver(client, session.contacts)

    await expect(resolver.resolveMany(['5511988887777'])).rejects.toThrow('503: zapo_contact_lookup_unavailable')
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledTimes(1)
  })

  test('treats an explicit server-side non-existing result as invalid instead of using stale cache', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    session.contacts.getByPhoneNumber.mockResolvedValue({
      jid: 'old@lid',
      lid: '123@lid',
      phoneNumber: '5511988887777',
      lastUpdatedMs: 1,
    } as never)
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([{
      queriedJid: '5511988887777@s.whatsapp.net',
      phoneJid: '5511988887777@s.whatsapp.net',
      lidJid: null,
      exists: false,
      invalid: false,
    }] as never)
    const resolver = new ZapoContactIdentityResolver(client, session.contacts, { now: () => 10_000, freshnessMs: 100 })

    await expect(resolver.resolveMany(['5511988887777'])).resolves.toEqual([
      expect.objectContaining({ source: 'network', status: 'invalid' }),
    ])
  })

  test('does not correlate a missing network result by array position', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    client.profile.getLidsByPhoneNumbers.mockResolvedValue([{
      queriedJid: '12025550123@s.whatsapp.net',
      phoneJid: '12025550123@s.whatsapp.net',
      lidJid: '222@lid',
      exists: true,
      invalid: false,
    }] as never)
    const resolver = new ZapoContactIdentityResolver(client, session.contacts)

    await expect(resolver.resolveMany(['5511988887777'])).rejects.toThrow('503: zapo_contact_lookup_unavailable')
    expect(client.profile.getLidsByPhoneNumbers).toHaveBeenCalledTimes(1)
  })

  test('rejects malformed input locally without querying the network', async () => {
    const client = mockDeep<WaClient>()
    const session = mockDeep<WaStoreSession>()
    const resolver = new ZapoContactIdentityResolver(client, session.contacts)

    await expect(resolver.resolveMany(['invalid'])).resolves.toEqual([
      { input: 'invalid', source: 'input', status: 'invalid' },
    ])
    expect(client.profile.getLidsByPhoneNumbers).not.toHaveBeenCalled()
  })
})
