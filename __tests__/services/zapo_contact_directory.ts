import { defaultConfig, getConfig } from '../../src/services/config'
import {
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

    await expect(findCachedContactPicture('session', {
      user_id: '123@lid',
      phone_number: '5566999554300',
      last_updated_ms: 1,
    }, lookup)).resolves.toBe('https://cdn.example/maria.jpg')
    expect(lookup).toHaveBeenCalledWith('session', '123@lid')
  })

  test('returns no picture without forcing a remote profile download', async () => {
    const lookup = jest.fn().mockResolvedValue(null)

    await expect(findCachedContactPicture('session', {
      user_id: '123@lid',
      phone_number: '5566999554300',
      last_updated_ms: 1,
    }, lookup)).resolves.toBeUndefined()
    expect(lookup).toHaveBeenCalled()
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
    const pictureLookup = jest.fn().mockImplementation(async (_phone, cacheId) =>
      cacheId === '2@lid' ? 'https://cdn.example/2.jpg' : undefined)
    const directory = new ZapoContactDirectory(loadConfig, async () => redis as never, undefined, pictureLookup)

    await expect(directory.list('session', { cursor: '7', limit: 50 })).resolves.toEqual({
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
    })
    expect(redis.scan).toHaveBeenCalledWith('7', {
      MATCH: 'unoapi:zapo:contact:session:*',
      COUNT: 50,
    })
  })

  test('escapes Redis glob characters from the session identifier', async () => {
    const redis = {
      scan: jest.fn().mockResolvedValue({ cursor: '0', keys: [] }),
      hGetAll: jest.fn(),
    }
    const loadConfig: getConfig = jest.fn().mockResolvedValue({ ...defaultConfig, provider: 'zapo' })
    const directory = new ZapoContactDirectory(loadConfig, async () => redis as never)

    await directory.list('session*one')
    expect(redis.scan).toHaveBeenCalledWith(
      '0',
      expect.objectContaining({
        MATCH: 'unoapi:zapo:contact:session\\*one:*',
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
})
