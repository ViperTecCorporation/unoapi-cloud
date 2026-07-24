import { PROFILE_PICTURE_NOT_FOUND_TTL_SEC } from '../defaults'
import { BASE_KEY, getRedis } from './redis'
import { profilePictureCacheIds } from './profile_picture_cache'

type RedisClient = Awaited<ReturnType<typeof getRedis>>
type RedisFactory = () => Promise<RedisClient>

export type ProfilePictureMissCacheOptions = {
  useRedis: boolean
  ttlSeconds?: number
  redisFactory?: RedisFactory
}

export class ProfilePictureMissCache {
  private readonly expiresAt = new Map<string, number>()
  private readonly ttlMs: number
  private readonly redisFactory: RedisFactory

  constructor(private readonly options: ProfilePictureMissCacheOptions) {
    this.ttlMs = Math.max(0, options.ttlSeconds ?? PROFILE_PICTURE_NOT_FOUND_TTL_SEC) * 1_000
    this.redisFactory = options.redisFactory ?? getRedis
  }

  async has(phone: string, jid: string, nowMs = Date.now()): Promise<boolean> {
    if (this.ttlMs === 0) return false
    const member = this.member(jid)
    if (!member) return false

    if (this.options.useRedis) {
      try {
        const redis = await this.redisFactory()
        const score = await redis.zScore(this.key(phone), member)
        if (score !== null && score > nowMs) return true
        if (score !== null) await redis.zRem(this.key(phone), member)
        return false
      } catch {}
    }

    const expiresAt = this.expiresAt.get(`${phone}:${member}`) || 0
    if (expiresAt > nowMs) return true
    this.expiresAt.delete(`${phone}:${member}`)
    return false
  }

  async mark(phone: string, jid: string, nowMs = Date.now()): Promise<void> {
    if (this.ttlMs === 0) return
    const member = this.member(jid)
    if (!member) return
    const expiresAt = nowMs + this.ttlMs
    this.expiresAt.set(`${phone}:${member}`, expiresAt)
    if (!this.options.useRedis) return

    try {
      const redis = await this.redisFactory()
      const key = this.key(phone)
      await redis.zRemRangeByScore(key, 0, nowMs)
      await redis.zAdd(key, [{ score: expiresAt, value: member }])
      await redis.expire(key, Math.ceil(this.ttlMs / 1_000))
    } catch {}
  }

  async invalidate(phone: string, jid: string): Promise<void> {
    const member = this.member(jid)
    if (!member) return
    this.expiresAt.delete(`${phone}:${member}`)
    if (!this.options.useRedis) return

    try {
      const redis = await this.redisFactory()
      await redis.zRem(this.key(phone), member)
    } catch {}
  }

  private key(phone: string) {
    return `${BASE_KEY}profile-picture-miss:${phone}`
  }

  private member(jid: string) {
    return profilePictureCacheIds(jid)[0]
  }
}
