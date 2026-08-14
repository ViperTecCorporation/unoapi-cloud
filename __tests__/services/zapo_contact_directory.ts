import { defaultConfig, getConfig } from '../../src/services/config'
import {
  countContactKeys,
  countContactKeyKinds,
  findCachedContactPicture,
  mapStoredZapoContact,
  normalizeContactPhoneNumber,
  ZapoContactDirectory,
} from '../../src/services/zapo/zapo_contact_directory'

describe('ZapoContactDirectory', () => {
  test('normalizes Brazilian mobile numbers with the ninth digit', () => {
    expect(normalizeContactPhoneNumber('556699554300@s.whatsapp.net')).toBe('5566999554300')
    expect(normalizeContactPhoneNumber('5566999554300@s.whatsapp.net')).toBe('5566999554300')
  })

  test('does not add the ninth digit to Brazilian landlines', () => {
    expect(normalizeContactPhoneNumber('556635211234@s.whatsapp.net')).toBe('556635211234')
  })

  test('only strips the JID suffix from non-Brazilian numbers', () => {
    expect(normalizeContactPhoneNumber('12025550123@s.whatsapp.net')).toBe('12025550123')
    expect(normalizeContactPhoneNumber()).toBeUndefined()
  })

  test('maps the Redis hash to the public LID-first contract', () => {
    expect(
      mapStoredZapoContact({
        jid: '123@lid',
        phone_number: '556699554300@s.whatsapp.net',
        display_name: 'Maria',
        push_name: 'Mari',
        username: 'maria',
        last_updated_ms: '1710000000000',
      }),
    ).toEqual({
      user_id: '123@lid',
      phone_number: '5566999554300',
      display_name: 'Maria',
      push_name: 'Mari',
      username: 'maria',
      last_updated_ms: 1710000000000,
    })
  })

  test('finds a cached picture by LID before trying the normalized phone', async () => {
    const lookup = jest.fn().mockResolvedValueOnce('https://cdn.example/maria.jpg')

    await expect(
      findCachedContactPicture(
        'session',
        {
          user_id: '123@lid',
          phone_number: '5566999554300',
          last_updated_ms: 1,
        },
        lookup,
      ),
    ).resolves.toBe('https://cdn.example/maria.jpg')
    expect(lookup).toHaveBeenCalledWith('session', '123@lid')
  })

  test('returns no picture without forcing a remote profile download', async () => {
    const lookup = jest.fn().mockResolvedValue(null)

    await expect(
      findCachedContactPicture(
        'session',
        {
          user_id: '123@lid',
          phone_number: '5566999554300',
          last_updated_ms: 1,
        },
        lookup,
      ),
    ).resolves.toBeUndefined()
    expect(lookup).toHaveBeenCalled()
  })

  test('regenerates an expired contact picture URL from session storage', async () => {
    const redis = {
      scan: jest.fn().mockResolvedValue({
        cursor: '0',
        keys: ['unoapi:zapo:contact:session:1@lid'],
      }),
      hGetAll: jest.fn().mockResolvedValue({
        jid: '1@lid',
        phone_number: '556699554300@s.whatsapp.net',
        last_updated_ms: '10',
      }),
    }
    const getImageUrl = jest
      .fn()
      .mockImplementation(async (jid: string) => (
        jid === '1@lid' ? 'https://cdn.example/fresh-contact.jpg' : undefined
      ))
    const loadConfig: getConfig = jest.fn().mockResolvedValue({
      ...defaultConfig,
      provider: 'zapo',
      getStore: jest.fn().mockResolvedValue({
        dataStore: { getImageUrl },
      }),
    })
    const expiredRedisPicture = jest.fn().mockResolvedValue(undefined)
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      expiredRedisPicture,
      async () => 1,
    )

    const page = await directory.list('session', { limit: 20 })

    expect(page.contacts[0].picture).toBe('https://cdn.example/fresh-contact.jpg')
    expect(getImageUrl).toHaveBeenCalledWith('1@lid')
  })

  test('ignores records without a canonical LID', () => {
    expect(mapStoredZapoContact({ jid: '556699554300@s.whatsapp.net' })).toBeUndefined()
  })

  test('lists one Redis cursor page and sorts it by update time', async () => {
    const redis = {
      scan: jest.fn().mockResolvedValue({
        cursor: '42',
        keys: ['unoapi:zapo:contact:session:1@lid', 'unoapi:zapo:contact:session:2@lid'],
      }),
      hGetAll: jest
        .fn()
        .mockResolvedValueOnce({ jid: '1@lid', phone_number: '556635211234@s.whatsapp.net', last_updated_ms: '10' })
        .mockResolvedValueOnce({ jid: '2@lid', phone_number: '556699554300@s.whatsapp.net', last_updated_ms: '20' }),
    }
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const pictureLookup = jest.fn().mockImplementation(async (_phone, cacheId) => (cacheId === '2@lid' ? 'https://cdn.example/2.jpg' : undefined))
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      pictureLookup,
      async () => 2,
    )

    await expect(directory.list('session', { cursor: '7', limit: 2 })).resolves.toEqual({
      contacts: [
        expect.objectContaining({
          user_id: '2@lid',
          phone_number: '5566999554300',
          picture: 'https://cdn.example/2.jpg',
        }),
        expect.objectContaining({ user_id: '1@lid', phone_number: '556635211234' }),
      ],
      next_cursor: '42',
      has_more: true,
      total_count: 2,
      raw_total_count: 2,
      ignored_count: 0,
    })
    expect(redis.scan).toHaveBeenCalledWith('7', {
      MATCH: 'unoapi:zapo:contact:session:*',
      COUNT: 500,
    })
  })

  test('enriches and searches contacts by the username index when the Zapo contact hash lacks it', async () => {
    const redis = {
      scan: jest.fn().mockResolvedValue({
        cursor: '0',
        keys: ['unoapi:zapo:contact:session:149396209594612@lid'],
      }),
      hGetAll: jest.fn().mockResolvedValue({
        jid: '149396209594612@lid',
        phone_number: '573106677588@s.whatsapp.net',
        display_name: 'Raul',
        last_updated_ms: '10',
      }),
    }
    const usernameLookup = jest.fn().mockResolvedValue(new Map([
      ['149396209594612@lid', 'raulasalazart'],
    ]))
    const loadConfig: getConfig = jest.fn().mockResolvedValue({
      ...defaultConfig,
      provider: 'zapo',
      useRedis: true,
    })
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      async () => undefined,
      async () => 1,
      usernameLookup,
    )

    const page = await directory.list('session', { search: 'raulasalazart' })

    expect(page.contacts).toEqual([
      expect.objectContaining({
        user_id: '149396209594612@lid',
        username: 'raulasalazart',
      }),
    ])
    expect(usernameLookup).toHaveBeenCalledWith(
      'session',
      ['149396209594612@lid'],
      false,
    )
  })

  test('continues scanning when the first Redis cursor page has no session contacts', async () => {
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce({ cursor: '16384', keys: [] })
        .mockResolvedValueOnce({
          cursor: '0',
          keys: ['unoapi:zapo:contact:session:1@lid'],
        }),
      hGetAll: jest.fn().mockResolvedValue({
        jid: '1@lid',
        phone_number: '556699554300@s.whatsapp.net',
        display_name: 'Contato encontrado',
        last_updated_ms: '10',
      }),
    }
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      async () => 'https://cdn.example/cached.jpg',
      async () => 1,
    )

    await expect(directory.list('session', { limit: 20 })).resolves.toEqual({
      contacts: [
        expect.objectContaining({
          user_id: '1@lid',
          display_name: 'Contato encontrado',
        }),
      ],
      next_cursor: '0',
      has_more: false,
      total_count: 1,
      raw_total_count: 1,
      ignored_count: 0,
    })
    expect(redis.scan).toHaveBeenNthCalledWith(
      2,
      '16384',
      expect.objectContaining({
        MATCH: 'unoapi:zapo:contact:session:*',
      }),
    )
  })

  test('searches contact identity and name across Redis cursor pages', async () => {
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce({
          cursor: '42',
          keys: ['unoapi:zapo:contact:session:1@lid'],
        })
        .mockResolvedValueOnce({
          cursor: '0',
          keys: ['unoapi:zapo:contact:session:2@lid'],
        }),
      hGetAll: jest
        .fn()
        .mockResolvedValueOnce({ jid: '1@lid', display_name: 'Maria', last_updated_ms: '10' })
        .mockResolvedValueOnce({ jid: '2@lid', display_name: 'João Comercial', last_updated_ms: '20' }),
    }
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      async () => 'https://cdn.example/cached.jpg',
      async () => 2,
    )

    const page = await directory.list('session', { search: 'comercial', limit: 20 })

    expect(page.contacts).toEqual([expect.objectContaining({ user_id: '2@lid', display_name: 'João Comercial' })])
    expect(redis.scan).toHaveBeenCalledTimes(2)
  })

  test('escapes Redis glob characters from the session identifier', async () => {
    const redis = {
      scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
      hGetAll: jest.fn(),
    }
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      undefined,
      async () => 0,
    )

    await directory.list('session*one')
    expect(redis.scan).toHaveBeenCalledWith(
      '0',
      expect.objectContaining({
        MATCH: 'unoapi:zapo:contact:session\\*one:*',
      }),
    )
  })

  test('keeps contact directories isolated by session phone', async () => {
    const contacts = new Map([
      ['unoapi:zapo:contact:111:1@lid', { jid: '1@lid', display_name: 'Sessão 111' }],
      ['unoapi:zapo:contact:222:2@lid', { jid: '2@lid', display_name: 'Sessão 222' }],
    ])
    const redis = {
      scan: jest.fn().mockImplementation(async (_cursor: string, options: { MATCH: string }) => ({
        cursor: '0',
        keys: [...contacts.keys()].filter((key) => key.startsWith(options.MATCH.slice(0, -1))),
      })),
      hGetAll: jest.fn().mockImplementation(async (key: string) => contacts.get(key) || {}),
    }
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      undefined,
      async () => 'https://cdn.example/cached.jpg',
      async (_client, pattern) => [...contacts.keys()].filter((key) => key.startsWith(pattern.slice(0, -1))).length,
    )

    const first = await directory.list('111')
    const second = await directory.list('222')

    expect(first.contacts.map((contact) => contact.display_name)).toEqual(['Sessão 111'])
    expect(second.contacts.map((contact) => contact.display_name)).toEqual(['Sessão 222'])
    expect(redis.scan).toHaveBeenNthCalledWith(1, '0', expect.objectContaining({
      MATCH: 'unoapi:zapo:contact:111:*',
    }))
    expect(redis.scan).toHaveBeenNthCalledWith(2, '0', expect.objectContaining({
      MATCH: 'unoapi:zapo:contact:222:*',
    }))
  })

  test('uses the canonical store prefix when the legacy env value is configured', async () => {
    const redis = {
      scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
      hGetAll: jest.fn(),
    }
    const loadConfig: getConfig = jest
      .fn()
      .mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const directory = new ZapoContactDirectory(
      loadConfig,
      async () => redis as never,
      'unoapi-zapo:',
      undefined,
      async () => 0,
    )

    await directory.list('session')

    expect(redis.scan).toHaveBeenCalledWith(
      '0',
      expect.objectContaining({
        MATCH: 'unoapi:zapo:contact:session:*',
      }),
    )
  })

  test('rejects caches belonging to a non-Zapo session', async () => {
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'baileys' })
    const redisFactory = jest.fn()
    const directory = new ZapoContactDirectory(loadConfig, redisFactory)

    await expect(directory.list('session')).rejects.toThrow('contact_directory_requires_zapo_provider')
    expect(redisFactory).not.toHaveBeenCalled()
  })

  test('counts every contact key across Redis cursor pages', async () => {
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce({ cursor: '42', keys: ['contact:1', 'contact:2'] })
        .mockResolvedValueOnce({ cursor: '0', keys: ['contact:3'] }),
    }

    await expect(
      countContactKeys(redis as never, 'unoapi:zapo:contact:session:*'),
    ).resolves.toBe(3)
    expect(redis.scan).toHaveBeenNthCalledWith(1, '0', {
      MATCH: 'unoapi:zapo:contact:session:*',
      COUNT: 1000,
    })
    expect(redis.scan).toHaveBeenNthCalledWith(2, '42', {
      MATCH: 'unoapi:zapo:contact:session:*',
      COUNT: 1000,
    })
  })

  test('separates canonical LID keys from raw and ignored contact keys', async () => {
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce({
          cursor: '42',
          keys: ['unoapi:zapo:contact:session:1@lid', 'unoapi:zapo:contact:session:5511@s.whatsapp.net'],
        })
        .mockResolvedValueOnce({
          cursor: '0',
          keys: ['unoapi:zapo:contact:session:2@lid'],
        }),
    }

    await expect(
      countContactKeyKinds(redis as never, 'unoapi:zapo:contact:session:*'),
    ).resolves.toEqual({
      total_count: 2,
      raw_total_count: 3,
      ignored_count: 1,
    })
  })
})
