jest.mock('../../src/services/redis', () => ({
  BASE_KEY: 'unoapi-',
  redisExpire: jest.fn(),
  redisZAdd: jest.fn(),
  redisZCount: jest.fn(),
  redisZRangeWithScores: jest.fn(),
  redisZRemRangeByScore: jest.fn(),
}))

import {
  checkMissingTcTokenQuota,
  getMissingTcTokenQuotaStatus,
  missingTcTokenQuotaKey,
  recordMissingTcTokenSend,
} from '../../src/services/privacy_token_quota'
import {
  redisExpire,
  redisZAdd,
  redisZCount,
  redisZRangeWithScores,
  redisZRemRangeByScore,
} from '../../src/services/redis'

const zCount = redisZCount as jest.Mock
const zRange = redisZRangeWithScores as jest.Mock
const zRemove = redisZRemRangeByScore as jest.Mock
const zAdd = redisZAdd as jest.Mock
const expire = redisExpire as jest.Mock

describe('Baileys missing tctoken policy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
    zRemove.mockResolvedValue(0)
    zCount.mockResolvedValue(0)
    zRange.mockResolvedValue([])
    zAdd.mockResolvedValue(undefined)
    expire.mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('builds an isolated Redis key using only session digits', () => {
    expect(missingTcTokenQuotaKey('+55 (66) 99999-9999')).toBe(
      'unoapi-missing-tctoken:5566999999999',
    )
  })

  test('reports the fixed monitoring-only Baileys policy', async () => {
    zCount.mockResolvedValue(3)
    zRange.mockResolvedValue([{ value: 'oldest', score: 1_799_999_000_000 }])

    await expect(getMissingTcTokenQuotaStatus('5566999999999')).resolves.toEqual({
      enabled: true,
      blockEnabled: false,
      limit: 40,
      used: 3,
      remaining: 37,
      windowHours: 24,
      resetAt: new Date(1_799_999_000_000 + 24 * 60 * 60 * 1000).toISOString(),
      blocked: false,
    })
  })

  test('fails open when Redis is unavailable', async () => {
    zRemove.mockRejectedValue(new Error('redis_down'))

    await expect(checkMissingTcTokenQuota('5566999999999')).resolves.toEqual({
      enabled: false,
      blockEnabled: false,
      limit: 40,
      used: 0,
      remaining: 40,
      windowHours: 24,
      blocked: false,
      allowed: true,
    })
  })

  test('records a missing token occurrence with the internal 25 hour TTL', async () => {
    await recordMissingTcTokenSend('5566999999999', 'message-1')

    expect(zAdd).toHaveBeenCalledWith(
      'unoapi-missing-tctoken:5566999999999',
      1_800_000_000_000,
      '1800000000000:message-1',
    )
    expect(expire).toHaveBeenCalledWith(
      'unoapi-missing-tctoken:5566999999999',
      25 * 60 * 60,
    )
  })
})
