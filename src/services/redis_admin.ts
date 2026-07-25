import { getRedis, redisScanSome } from './redis'
import { redactLogValue } from './log_redaction'

export type RedisKeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'none'

export type RedisKeyDetails = {
  key: string
  type: RedisKeyType
  ttl: number
  size: number
  truncated: boolean
  value: unknown
}

export class RedisAdminError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'RedisAdminError'
  }
}

const allowedPrefixes = ['unoapi-', 'unoapi:']

export const isAllowedRedisKey = (key: string): boolean =>
  allowedPrefixes.some((prefix) => `${key || ''}`.startsWith(prefix))

export const parseRedisValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return redactLogValue(value)
  try {
    return redactLogValue(JSON.parse(value))
  } catch {
    return redactLogValue(value)
  }
}

export const containsRedactedValue = (value: unknown): boolean => {
  if (value === '[REDACTED]') return true
  if (Array.isArray(value)) return value.some(containsRedactedValue)
  if (value && typeof value === 'object') return Object.values(value).some(containsRedactedValue)
  return false
}

export class RedisAdmin {
  constructor(private readonly clientFactory: typeof getRedis = getRedis) {}

  private assertKey(key: string): void {
    if (!isAllowedRedisKey(key)) throw new RedisAdminError(403, 'redis_key_not_allowed')
  }

  async listKeys(search = '', limit = 200): Promise<string[]> {
    const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 200))
    const term = `${search || ''}`.trim().replace(/[*?[\]]/g, '')
    const groups = await Promise.all(
      allowedPrefixes.map((prefix) => redisScanSome(`${prefix}*${term}*`, safeLimit)),
    )
    return [...new Set(groups.flat())].sort().slice(0, safeLimit)
  }

  async getKey(key: string): Promise<RedisKeyDetails> {
    this.assertKey(key)
    const client: any = await this.clientFactory()
    const type = `${await client.type(key)}` as RedisKeyType
    const ttl = Number(await client.ttl(key))
    let value: unknown = null
    let size = 0
    let truncated = false
    if (type === 'string') {
      value = parseRedisValue(await client.get(key))
      size = typeof value === 'string' ? value.length : JSON.stringify(value).length
    } else if (type === 'hash') {
      const data = await client.hGetAll(key)
      size = Number(await client.hLen(key))
      truncated = size > 200
      value = parseRedisValue(Object.fromEntries(Object.entries(data).slice(0, 200)))
    } else if (type === 'list') {
      size = Number(await client.lLen(key))
      truncated = size > 200
      value = parseRedisValue(await client.lRange(key, 0, 199))
    } else if (type === 'set') {
      const data = await client.sMembers(key)
      size = Number(await client.sCard(key))
      truncated = size > 200
      value = parseRedisValue(data.slice(0, 200))
    } else if (type === 'zset') {
      size = Number(await client.zCard(key))
      truncated = size > 200
      value = parseRedisValue(await client.zRangeWithScores(key, 0, 199))
    } else if (type === 'stream') {
      size = Number(await client.xLen(key))
      truncated = size > 100
      value = parseRedisValue(await client.xRange(key, '-', '+', { COUNT: 100 }))
    }
    return { key, type, ttl, size, truncated, value }
  }

  async saveKey(key: string, type: RedisKeyType, value: unknown, ttlSeconds = -1): Promise<void> {
    this.assertKey(key)
    if (!['string', 'hash', 'list', 'set', 'zset'].includes(type)) {
      throw new RedisAdminError(400, 'redis_type_not_editable')
    }
    if (containsRedactedValue(value)) {
      throw new RedisAdminError(400, 'redis_redacted_value_cannot_be_saved')
    }
    if (type === 'hash' && (!value || typeof value !== 'object' || Array.isArray(value))) {
      throw new RedisAdminError(400, 'redis_hash_object_required')
    }
    if (type === 'hash' && !Object.keys(value as object).length) {
      throw new RedisAdminError(400, 'redis_collection_cannot_be_empty')
    }
    if (['list', 'set', 'zset'].includes(type) && !Array.isArray(value)) {
      throw new RedisAdminError(400, type === 'zset' ? 'redis_zset_array_required' : 'redis_array_required')
    }
    if (Array.isArray(value) && ['list', 'set', 'zset'].includes(type) && !value.length) {
      throw new RedisAdminError(400, 'redis_collection_cannot_be_empty')
    }
    const client: any = await this.clientFactory()
    const transaction = client.multi()
    transaction.del(key)
    if (type === 'string') {
      transaction.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    } else if (type === 'hash') {
      transaction.hSet(key, Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, item]) => [field, typeof item === 'string' ? item : JSON.stringify(item)])))
    } else if (type === 'list') {
      transaction.rPush(key, (value as unknown[]).map((item) => typeof item === 'string' ? item : JSON.stringify(item)))
    } else if (type === 'set') {
      transaction.sAdd(key, (value as unknown[]).map((item) => typeof item === 'string' ? item : JSON.stringify(item)))
    } else if (type === 'zset') {
      transaction.zAdd(key, (value as any[]).map((item) => ({ value: `${item.value}`, score: Number(item.score) || 0 })))
    }
    if (ttlSeconds > 0) transaction.expire(key, Math.floor(ttlSeconds))
    await transaction.exec()
  }

  async deleteKey(key: string): Promise<number> {
    this.assertKey(key)
    const client: any = await this.clientFactory()
    return Number(await client.del(key)) || 0
  }

  async query(command: string, args: string[] = []): Promise<unknown> {
    const name = `${command || ''}`.trim().toUpperCase()
    const client: any = await this.clientFactory()
    if (name === 'SCAN') {
      return this.listKeys(args[0] || '', Number(args[1]) || 200)
    }
    const key = `${args[0] || ''}`
    this.assertKey(key)
    if (name === 'TYPE') return client.type(key)
    if (name === 'TTL') return client.ttl(key)
    if (name === 'GET') return parseRedisValue(await client.get(key))
    if (name === 'HGETALL') return parseRedisValue(await client.hGetAll(key))
    if (name === 'LRANGE') return parseRedisValue(await client.lRange(key, 0, 199))
    if (name === 'SMEMBERS') return parseRedisValue(await client.sMembers(key))
    if (name === 'ZRANGE') return parseRedisValue(await client.zRangeWithScores(key, 0, 199))
    throw new RedisAdminError(400, 'redis_command_not_allowed')
  }
}
