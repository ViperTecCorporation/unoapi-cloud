jest.mock('../../src/services/redis', () => ({
  redisGet: jest.fn(),
  redisSetAndExpire: jest.fn(),
  redisSetIfNotExists: jest.fn(),
}))

import {
  deprecatedRabbitQueueReason,
  RabbitQueueCleanupMigration,
  rabbitQueueCleanupLockKey,
  rabbitQueueCleanupMarkerKey,
  runRabbitQueueCleanupMigration,
} from '../../src/services/rabbitmq_queue_cleanup'

const queue = (
  name: string,
  messages = 0,
  consumers = 0,
  messagesUnacknowledged = 0,
) => ({
  name,
  messages,
  messages_ready: messages,
  messages_unacknowledged: messagesUnacknowledged,
  consumers,
})

const store = () => ({
  get: jest.fn().mockResolvedValue(null),
  acquire: jest.fn().mockResolvedValue(true),
  setPersistent: jest.fn().mockResolvedValue('OK'),
})

describe('RabbitMQ Zapo-only cleanup migration', () => {
  test.each([
    ['unoapi.incoming.server_1.baileys', 'baileys'],
    ['unoapi.listener.server_2.baileys.dead', 'baileys'],
    ['unoapi.bind.server_1.delayed', 'legacy'],
    ['unoapi.reload.undefined.dead', 'legacy'],
  ])('classifies deprecated queue %s', (name, reason) => {
    expect(deprecatedRabbitQueueReason(name)).toBe(reason)
  })

  test.each([
    'unoapi.incoming.server_1.zapo',
    'unoapi.incoming.server_1.zapo.dead',
    'unoapi.reload',
    'unoapi.outgoing.dead',
    'foreign.incoming.server_1.baileys',
  ])('preserves queue %s', (name) => {
    expect(deprecatedRabbitQueueReason(name)).toBeUndefined()
  })

  test('uses stable Redis keys for the one-shot marker and lock', () => {
    expect(rabbitQueueCleanupMarkerKey()).toBe(
      'unoapi-app:migration:rabbitmq-zapo-only-queues-v1:done',
    )
    expect(rabbitQueueCleanupLockKey()).toBe(
      'unoapi-app:migration:rabbitmq-zapo-only-queues-v1:lock',
    )
  })

  test('does nothing after the persistent completion marker exists', async () => {
    const state = store()
    state.get.mockResolvedValue('done')
    const manager = { listQueues: jest.fn(), deleteQueue: jest.fn() }

    await expect(new RabbitQueueCleanupMigration(manager, state).run())
      .resolves.toMatchObject({ status: 'already_completed' })
    expect(manager.listQueues).not.toHaveBeenCalled()
  })

  test('does nothing when another process owns the migration lock', async () => {
    const state = store()
    state.acquire.mockResolvedValue(false)
    const manager = { listQueues: jest.fn().mockResolvedValue([]), deleteQueue: jest.fn() }

    await expect(new RabbitQueueCleanupMigration(manager, state).run())
      .resolves.toMatchObject({ status: 'lock_busy' })
    expect(manager.listQueues).toHaveBeenCalledTimes(1)
    expect(manager.deleteQueue).not.toHaveBeenCalled()
  })

  test('aborts the entire cleanup while a deprecated worker still consumes', async () => {
    const state = store()
    const manager = {
      listQueues: jest.fn().mockResolvedValue([
        queue('unoapi.incoming.server_1.baileys', 0, 5),
        queue('unoapi.bind.server_1', 222),
      ]),
      deleteQueue: jest.fn(),
    }

    await expect(new RabbitQueueCleanupMigration(manager, state).run()).resolves.toMatchObject({
      status: 'active_consumers',
      activeQueues: ['unoapi.incoming.server_1.baileys'],
    })
    expect(manager.deleteQueue).not.toHaveBeenCalled()
    expect(state.setPersistent).not.toHaveBeenCalled()
  })

  test('deletes only deprecated queues and persists the disposal report', async () => {
    const state = store()
    const manager = {
      listQueues: jest.fn().mockResolvedValue([
        queue('unoapi.bind.server_1', 222),
        queue('unoapi.listener.server_1.baileys.dead', 3),
        queue('unoapi.listener.server_1.zapo', 10, 4),
        queue('unoapi.outgoing.dead', 8),
      ]),
      deleteQueue: jest.fn().mockResolvedValue(undefined),
    }

    await expect(new RabbitQueueCleanupMigration(manager, state).run()).resolves.toMatchObject({
      status: 'completed',
      discardedMessages: 225,
      deleted: [
        { name: 'unoapi.bind.server_1', messages: 222, reason: 'legacy' },
        { name: 'unoapi.listener.server_1.baileys.dead', messages: 3, reason: 'baileys' },
      ],
    })
    expect(manager.deleteQueue).toHaveBeenCalledTimes(2)
    expect(state.setPersistent).toHaveBeenCalledWith(
      rabbitQueueCleanupMarkerKey(),
      expect.stringContaining('"discardedMessages":225'),
    )
  })

  test('does not write the completion marker when deletion fails', async () => {
    const state = store()
    const manager = {
      listQueues: jest.fn().mockResolvedValue([queue('unoapi.bind.server_1')]),
      deleteQueue: jest.fn().mockRejectedValue(new Error('rabbit_down')),
    }

    await expect(new RabbitQueueCleanupMigration(manager, state).run()).rejects.toThrow('rabbit_down')
    expect(state.setPersistent).not.toHaveBeenCalled()
  })

  test('runs the boot migration facade and returns its report', async () => {
    const report = {
      status: 'completed' as const,
      deleted: [],
      discardedMessages: 0,
      activeQueues: [],
    }
    const migration = { run: jest.fn().mockResolvedValue(report) }

    await expect(runRabbitQueueCleanupMigration(migration)).resolves.toBe(report)
    expect(migration.run).toHaveBeenCalledTimes(1)
  })
})
