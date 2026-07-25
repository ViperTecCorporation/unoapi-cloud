import { parseRabbitQueueName, rabbitQueueScopeLabels } from '../../frontend/domain/rabbit_queue'

describe('RabbitMQ queue identity', () => {
  test('parses provider, server and dead-letter lifecycle independently', () => {
    expect(parseRabbitQueueName('unoapi.incoming.server_1.zapo.dead')).toEqual({
      family: 'incoming',
      lifecycle: 'dead',
      provider: 'zapo',
      server: 'server_1',
      variant: undefined,
      legacy: false,
      invalidServer: false,
    })
  })

  test('marks old provider queues without an explicit engine as legacy', () => {
    expect(parseRabbitQueueName('unoapi.listener.server_1.dead')).toMatchObject({
      family: 'listener',
      lifecycle: 'dead',
      legacy: true,
    })
  })

  test('identifies invalid server and functional variants', () => {
    expect(parseRabbitQueueName('unoapi.reload.undefined.delayed')).toMatchObject({
      family: 'reload',
      lifecycle: 'delayed',
      invalidServer: true,
    })
    expect(parseRabbitQueueName('unoapi.bulk.status')).toMatchObject({
      family: 'bulk',
      variant: 'status',
    })
  })

  test('builds visible scope labels for similar queue names', () => {
    expect(rabbitQueueScopeLabels('unoapi.listener.server_1.baileys.delayed')).toEqual([
      'Baileys', 'server_1', 'Atrasada / retentativa',
    ])
    expect(rabbitQueueScopeLabels('unoapi.reload.undefined.dead')).toEqual([
      'Legada / sem motor', 'Servidor indefinido', 'Dead-letter',
    ])
  })
})
