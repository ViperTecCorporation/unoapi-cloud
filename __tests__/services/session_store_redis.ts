jest.mock('../../src/services/redis', () => ({
  configKey: (phone: string) => `unoapi-config-${phone}`,
  authKey: (key: string) => `unoapi-auth-${key}`,
  sessionStatusKey: (phone: string) => `unoapi-status-${phone}`,
  redisKeys: jest.fn(),
  getSessionPhones: jest.fn(),
  getSessionStatus: jest.fn(),
  setSessionStatus: jest.fn(),
  redisGet: jest.fn(),
  getConnectCount: jest.fn(),
  setConnectCount: jest.fn(),
  delAuth: jest.fn(),
  clearConnectCount: jest.fn(),
  getAllAuthTokens: jest.fn(),
  addAuthTokensToIndex: jest.fn(),
  getAuthKeyCount: jest.fn(),
}))

import { SessionStoreRedis } from '../../src/services/session_store_redis'
import {
  delAuth,
  getAuthKeyCount,
  getSessionPhones,
  getSessionStatus,
  redisKeys,
  redisGet,
} from '../../src/services/redis'

describe('SessionStoreRedis session inventory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses the maintained session index without scanning the config keyspace', async () => {
    ;(getSessionPhones as jest.Mock).mockResolvedValue(['5566996269251', '5566999424178'])
    const store = new SessionStoreRedis()

    await expect(store.getPhones()).resolves.toEqual(['5566996269251', '5566999424178'])
    expect(getSessionPhones).toHaveBeenCalledTimes(1)
    expect(redisKeys).not.toHaveBeenCalled()
  })

  it('propagates an index migration failure instead of falling back to KEYS', async () => {
    ;(getSessionPhones as jest.Mock).mockRejectedValue(new Error('migration failed'))
    const store = new SessionStoreRedis()

    await expect(store.getPhones()).rejects.toThrow('migration failed')
    expect(redisKeys).not.toHaveBeenCalled()
  })
})

describe('SessionStoreRedis provider-aware startup sync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getSessionStatus as jest.Mock).mockResolvedValue('offline')
    ;(redisGet as jest.Mock).mockImplementation(async (key: string) => (
      key === 'unoapi-config-5566999554300'
        ? JSON.stringify({ provider: 'zapo' })
        : null
    ))
  })

  it('does not scan the legacy auth keyspace for a Zapo session', async () => {
    const store = new SessionStoreRedis()

    await store.syncConnection('5566999554300')

    expect(getAuthKeyCount).not.toHaveBeenCalled()
    expect(delAuth).not.toHaveBeenCalled()
  })

  it('preserves the legacy orphan-auth cleanup for other providers', async () => {
    ;(redisGet as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'unoapi-config-5566999554300') return JSON.stringify({ provider: 'legacy' })
      if (key === 'unoapi-auth-5566999554300:creds') return JSON.stringify({ me: { id: '5566999554300' } })
      return null
    })
    ;(getAuthKeyCount as jest.Mock).mockResolvedValue({ count: 1, exact: true })
    const store = new SessionStoreRedis()

    await store.syncConnection('5566999554300')

    expect(getAuthKeyCount).toHaveBeenCalledWith('5566999554300')
    expect(delAuth).toHaveBeenCalledWith('5566999554300')
  })
})
