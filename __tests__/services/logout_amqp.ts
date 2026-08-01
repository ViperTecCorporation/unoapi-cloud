jest.mock('../../src/amqp', () => ({
  amqpPublish: jest.fn().mockResolvedValue(undefined),
}))

import { amqpPublish } from '../../src/amqp'
import { defaultConfig } from '../../src/services/config'
import { LogoutAmqp } from '../../src/services/logout_amqp'

describe('AMQP logout with suppressed Baileys', () => {
  beforeEach(() => jest.clearAllMocks())

  test('cleans a legacy Baileys session locally without publishing to a dead worker', async () => {
    const cleanup = jest.fn().mockResolvedValue(undefined)
    const logout = new LogoutAmqp(
      async () => ({ ...defaultConfig, provider: 'baileys' }),
      cleanup,
    )

    await logout.run('5566')

    expect(cleanup).toHaveBeenCalledWith('5566')
    expect(amqpPublish).not.toHaveBeenCalled()
  })

  test('keeps Zapo logout routed to its provider worker', async () => {
    const cleanup = jest.fn()
    const logout = new LogoutAmqp(
      async () => ({ ...defaultConfig, provider: 'zapo', server: 'server_1' }),
      cleanup,
    )

    await logout.run('5577')

    expect(cleanup).not.toHaveBeenCalled()
    expect(amqpPublish).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('.server_1.zapo'),
      '',
      expect.objectContaining({ phone: '5577', source: 'deregister_api' }),
      { type: 'direct' },
    )
  })
})
