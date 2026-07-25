jest.mock('../../src/services/redis', () => ({
  getRedis: jest.fn(),
  redisScanSome: jest.fn(),
}))

import { redisScanSome } from '../../src/services/redis'
import {
  containsRedactedValue,
  isAllowedRedisKey,
  parseRedisValue,
  RedisAdmin,
  RedisAdminError,
  redisTreeNodes,
} from '../../src/services/redis_admin'

const scan = redisScanSome as jest.MockedFunction<typeof redisScanSome>

describe('Redis admin service', () => {
  beforeEach(() => scan.mockReset())

  test('restricts administration to UnoAPI namespaces', () => {
    expect(isAllowedRedisKey('unoapi-config:5566')).toBe(true)
    expect(isAllowedRedisKey('unoapi:zapo:contacts:5566')).toBe(true)
    expect(isAllowedRedisKey('foreign:key')).toBe(false)
  })

  test('parses JSON and redacts sensitive fields', () => {
    expect(parseRedisValue('{"phone":"5566","token":"secret"}')).toEqual({
      phone: '5566',
      token: '[REDACTED]',
    })
  })

  test('detects redacted values recursively', () => {
    expect(containsRedactedValue({ nested: ['ok', '[REDACTED]'] })).toBe(true)
    expect(containsRedactedValue({ nested: ['ok'] })).toBe(false)
  })

  test('lists keys with SCAN instead of KEYS', async () => {
    scan
      .mockResolvedValueOnce(['unoapi-config:5566'])
      .mockResolvedValueOnce(['unoapi:zapo:contact:5566'])
    const admin = new RedisAdmin(jest.fn() as any)
    await expect(admin.listKeys('5566', 20)).resolves.toEqual([
      'unoapi-config:5566',
      'unoapi:zapo:contact:5566',
    ])
    expect(scan).toHaveBeenCalledWith('unoapi-*5566*', 20)
  })

  test('does not duplicate the namespace when searching a complete key', async () => {
    scan.mockResolvedValueOnce(['unoapi:zapo:auth:5548991710539'])
    const admin = new RedisAdmin(jest.fn() as any)
    await expect(admin.listKeys('unoapi:zapo:auth:5548991710539', 20)).resolves.toEqual([
      'unoapi:zapo:auth:5548991710539',
    ])
    expect(scan).toHaveBeenCalledTimes(1)
    expect(scan).toHaveBeenCalledWith('unoapi:zapo:auth:5548991710539*', 20)
  })

  test('returns only direct children for a lazily expanded Redis prefix', async () => {
    expect(redisTreeNodes([
      'unoapi:zapo:auth:5566',
      'unoapi:zapo:contacts:5566',
      'unoapi:zapo:status',
    ], 'unoapi:zapo:')).toEqual([
      { label: 'auth', path: 'unoapi:zapo:auth:', kind: 'branch' },
      { label: 'contacts', path: 'unoapi:zapo:contacts:', kind: 'branch' },
      { label: 'status', path: 'unoapi:zapo:status', kind: 'key' },
    ])
  })

  test('loads a bounded sample only when a Redis branch is expanded', async () => {
    scan.mockResolvedValueOnce([
      'unoapi:zapo:auth:5566',
      'unoapi:zapo:contacts:5566',
    ])
    const admin = new RedisAdmin(jest.fn() as any)
    await expect(admin.listTree('unoapi:zapo:', 20)).resolves.toEqual([
      { label: 'auth', path: 'unoapi:zapo:auth:', kind: 'branch' },
      { label: 'contacts', path: 'unoapi:zapo:contacts:', kind: 'branch' },
    ])
    expect(scan).toHaveBeenCalledWith('unoapi:zapo:*', 400)
  })

  test('interleaves legacy and colon namespaces instead of starving Zapo keys', async () => {
    scan
      .mockResolvedValueOnce(['unoapi-auth:1', 'unoapi-auth:2'])
      .mockResolvedValueOnce(['unoapi:zapo:auth:1', 'unoapi:zapo:auth:2'])
    const admin = new RedisAdmin(jest.fn() as any)
    await expect(admin.listKeys('', 2)).resolves.toEqual([
      'unoapi-auth:1',
      'unoapi:zapo:auth:1',
    ])
  })

  test('reads typed key content with TTL and truncation metadata', async () => {
    const client = {
      type: jest.fn().mockResolvedValue('hash'),
      ttl: jest.fn().mockResolvedValue(300),
      hGetAll: jest.fn().mockResolvedValue({ phone: '5566', authToken: 'secret' }),
      hLen: jest.fn().mockResolvedValue(2),
    }
    const admin = new RedisAdmin(jest.fn().mockResolvedValue(client) as any)
    await expect(admin.getKey('unoapi:session:5566')).resolves.toMatchObject({
      type: 'hash',
      ttl: 300,
      size: 2,
      value: { phone: '5566', authToken: '[REDACTED]' },
    })
  })

  test('saves editable types atomically and preserves TTL', async () => {
    const transaction = {
      del: jest.fn(),
      hSet: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    }
    const client = { multi: jest.fn(() => transaction) }
    const admin = new RedisAdmin(jest.fn().mockResolvedValue(client) as any)
    await admin.saveKey('unoapi:test', 'hash', { field: 'value' }, 60)
    expect(transaction.del).toHaveBeenCalledWith('unoapi:test')
    expect(transaction.hSet).toHaveBeenCalledWith('unoapi:test', { field: 'value' })
    expect(transaction.expire).toHaveBeenCalledWith('unoapi:test', 60)
    expect(transaction.exec).toHaveBeenCalled()
  })

  test('does not overwrite secrets from a redacted preview', async () => {
    const clientFactory = jest.fn()
    const admin = new RedisAdmin(clientFactory as any)
    await expect(admin.saveKey('unoapi:secret', 'hash', { token: '[REDACTED]' }))
      .rejects.toThrow('redis_redacted_value_cannot_be_saved')
    expect(clientFactory).not.toHaveBeenCalled()
  })

  test('rejects empty collections instead of silently deleting the key', async () => {
    const clientFactory = jest.fn()
    const admin = new RedisAdmin(clientFactory as any)
    await expect(admin.saveKey('unoapi:list', 'list', []))
      .rejects.toThrow('redis_collection_cannot_be_empty')
    expect(clientFactory).not.toHaveBeenCalled()
  })

  test('deletes only allowed keys', async () => {
    const client = { del: jest.fn().mockResolvedValue(1) }
    const admin = new RedisAdmin(jest.fn().mockResolvedValue(client) as any)
    await expect(admin.deleteKey('unoapi:test')).resolves.toBe(1)
    await expect(admin.deleteKey('foreign:test')).rejects.toEqual(
      expect.objectContaining<RedisAdminError>({ status: 403 }),
    )
  })

  test('allows only explicit read commands', async () => {
    const client = { get: jest.fn().mockResolvedValue('value') }
    const admin = new RedisAdmin(jest.fn().mockResolvedValue(client) as any)
    await expect(admin.query('GET', ['unoapi:test'])).resolves.toBe('value')
    await expect(admin.query('FLUSHALL')).rejects.toEqual(
      expect.objectContaining<RedisAdminError>({ message: 'redis_key_not_allowed' }),
    )
  })
})
