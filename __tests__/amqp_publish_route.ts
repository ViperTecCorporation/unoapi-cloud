import { bindPublishRoute, sessionBindQueueName } from '../src/amqp'

describe('AMQP publish route', () => {
  test('binds the destination queue before returning the publish routing key', async () => {
    const channel = { bindQueue: jest.fn().mockResolvedValue(undefined) }

    const destination = await bindPublishRoute(
      channel as never,
      'unoapi.brigde',
      'unoapi.incoming.server_1.zapo',
      '5566996269251',
    )

    expect(channel.bindQueue).toHaveBeenCalledWith(
      'unoapi.incoming.server_1.zapo',
      'unoapi.brigde',
      'unoapi.incoming.server_1.zapo.5566996269251',
    )
    expect(destination).toBe('unoapi.incoming.server_1.zapo.5566996269251')
  })

  test('routes session discovery only through provider-specific bind queues', () => {
    expect(sessionBindQueueName('unoapi.incoming.server_1.zapo')).toBe('unoapi.bind.server_1.zapo')
    expect(sessionBindQueueName('unoapi.incoming.server_1.baileys')).toBe('unoapi.bind.server_1.baileys')
    expect(sessionBindQueueName('unoapi.outgoing')).toBeUndefined()
  })
})
