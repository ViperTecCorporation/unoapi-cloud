jest.mock('../../src/services/redis', () => ({
  delAuth: jest.fn().mockResolvedValue(undefined),
  delConfig: jest.fn().mockResolvedValue(undefined),
  delSessionStatus: jest.fn().mockResolvedValue(undefined),
  delSessionTransientKeys: jest.fn().mockResolvedValue(undefined),
  redisKeys: jest.fn().mockResolvedValue([]),
  redisDelKey: jest.fn().mockResolvedValue(undefined),
  BASE_KEY: 'unoapi-',
}))

import { configs } from '../../src/services/config'
import {
  clearLegacyBaileysSession,
  legacyBaileysKeyPatterns,
} from '../../src/services/legacy_baileys_cleanup'
import {
  delAuth,
  delConfig,
  delSessionStatus,
  delSessionTransientKeys,
  redisDelKey,
  redisKeys,
} from '../../src/services/redis'

describe('legacy Baileys cleanup', () => {
  beforeEach(() => {
    configs.clear()
    jest.clearAllMocks()
  })

  test('removes auth, transient state, status and config idempotently', async () => {
    configs.set('5566', {} as never)

    await clearLegacyBaileysSession('5566')
    await clearLegacyBaileysSession('5566')

    expect(delAuth).toHaveBeenCalledTimes(2)
    expect(delSessionTransientKeys).toHaveBeenCalledTimes(2)
    expect(delSessionStatus).toHaveBeenCalledTimes(2)
    expect(delConfig).toHaveBeenCalledTimes(2)
    expect(configs.has('5566')).toBe(false)
  })

  test('removes all session-scoped cache families without touching global mappings', async () => {
    ;(redisKeys as jest.Mock).mockImplementation(async (pattern: string) =>
      pattern.startsWith('unoapi-message:5566:') ? ['unoapi-message:5566:chat:id'] : [])

    await clearLegacyBaileysSession('5566')

    expect(redisKeys).toHaveBeenCalledWith('unoapi-message:5566:*')
    expect(redisKeys).toHaveBeenCalledWith('unoapi-group:5566:*')
    expect(redisKeys).not.toHaveBeenCalledWith(expect.stringContaining('jidmap:global'))
    expect(redisDelKey).toHaveBeenCalledWith('unoapi-message:5566:chat:id')
  })

  test('normalizes the session phone used in deletion patterns', () => {
    expect(legacyBaileysKeyPatterns('+55 (66) 99999-0000')).toContain(
      'unoapi-message:5566999990000:*',
    )
    expect(() => legacyBaileysKeyPatterns('invalid')).toThrow(
      'invalid_legacy_session_phone',
    )
  })
})
