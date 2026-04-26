describe('service meta alias', () => {
  const originalRedisUrl = process.env.REDIS_URL

  afterEach(() => {
    jest.resetModules()
    process.env.REDIS_URL = originalRedisUrl
  })

  test('keeps direct phone ids when redis is disabled', async () => {
    delete process.env.REDIS_URL
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveSessionPhoneByMetaId } = require('../../src/services/meta_alias')

    await expect(resolveSessionPhoneByMetaId('+5566999554300')).resolves.toBe('5566999554300')
  })

  test('resolves phone_number_id mapping before returning raw id', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    jest.doMock('../../src/services/redis', () => ({
      getPhoneByPhoneNumberId: jest.fn().mockResolvedValue('5566999554300'),
      getPhoneByBusinessAccountId: jest.fn().mockResolvedValue(undefined),
    }))
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveSessionPhoneByMetaId } = require('../../src/services/meta_alias')

    await expect(resolveSessionPhoneByMetaId('phone-id-1')).resolves.toBe('5566999554300')
  })

  test('falls back to business_account_id mapping', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    jest.doMock('../../src/services/redis', () => ({
      getPhoneByPhoneNumberId: jest.fn().mockResolvedValue(undefined),
      getPhoneByBusinessAccountId: jest.fn().mockResolvedValue('+5566999554300'),
    }))
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveSessionPhoneByMetaId } = require('../../src/services/meta_alias')

    await expect(resolveSessionPhoneByMetaId('waba-id-1')).resolves.toBe('5566999554300')
  })
})
