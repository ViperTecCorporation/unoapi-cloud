import { mockDeep } from 'jest-mock-extended'
import type { RedisClientType } from 'redis'
import { ProfilePictureMissCache } from '../../src/services/profile_picture_miss_cache'

describe('ProfilePictureMissCache', () => {
  const phone = '5566999999999'
  const lid = '190280070385782@lid'
  let redis: ReturnType<typeof mockDeep<RedisClientType>>

  beforeEach(() => {
    redis = mockDeep<RedisClientType>()
  })

  test('persists one expiring ZSET member per missing identity', async () => {
    const cache = new ProfilePictureMissCache({
      useRedis: true,
      ttlSeconds: 10_800,
      redisFactory: async () => redis,
    })

    await cache.mark(phone, lid, 1_000)

    expect(redis.zAdd).toHaveBeenCalledWith(
      expect.stringContaining(`profile-picture-miss:${phone}`),
      [{ score: 10_801_000, value: lid }],
    )
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 10_800)
  })

  test('reads a persisted miss after a new runtime instance starts', async () => {
    redis.zScore.mockResolvedValue(10_801_000)
    const cache = new ProfilePictureMissCache({
      useRedis: true,
      ttlSeconds: 10_800,
      redisFactory: async () => redis,
    })

    await expect(cache.has(phone, lid, 2_000)).resolves.toBe(true)
  })

  test('removes expired and provider-invalidated misses', async () => {
    redis.zScore.mockResolvedValue(1_000)
    const cache = new ProfilePictureMissCache({
      useRedis: true,
      ttlSeconds: 10_800,
      redisFactory: async () => redis,
    })

    await expect(cache.has(phone, lid, 2_000)).resolves.toBe(false)
    await cache.invalidate(phone, lid)

    expect(redis.zRem).toHaveBeenCalledTimes(2)
  })

  test('falls back to process memory when Redis is unavailable', async () => {
    const cache = new ProfilePictureMissCache({ useRedis: false, ttlSeconds: 10 })

    await cache.mark(phone, lid, 1_000)
    await expect(cache.has(phone, lid, 5_000)).resolves.toBe(true)
    await expect(cache.has(phone, lid, 11_001)).resolves.toBe(false)
  })
})
