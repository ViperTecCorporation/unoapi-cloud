import { randomUUID } from 'crypto'
import { UNOAPI_QUEUE_NAME } from '../defaults'
import logger from './logger'
import { RabbitManagement, RabbitQueue } from './rabbitmq_management'
import { redisGet, redisSetAndExpire, redisSetIfNotExists } from './redis'

const CLEANUP_NAME = 'rabbitmq-zapo-only-queues-v1'
const PROVIDER_FAMILIES = new Set(['bind', 'incoming', 'listener', 'logout', 'reload'])

export const rabbitQueueCleanupMarkerKey = (queuePrefix = UNOAPI_QUEUE_NAME) =>
  `${queuePrefix}-app:migration:${CLEANUP_NAME}:done`

export const rabbitQueueCleanupLockKey = (queuePrefix = UNOAPI_QUEUE_NAME) =>
  `${queuePrefix}-app:migration:${CLEANUP_NAME}:lock`

export const deprecatedRabbitQueueReason = (
  name: string,
  queuePrefix = UNOAPI_QUEUE_NAME,
): 'baileys' | 'legacy' | undefined => {
  const parts = `${name || ''}`.split('.').filter(Boolean)
  if (parts[0] !== queuePrefix) return undefined
  const family = parts[1]
  if (!PROVIDER_FAMILIES.has(family)) return undefined
  if (parts.includes('zapo')) return undefined
  if (parts.includes('baileys')) return 'baileys'
  const hasLegacyScope = parts.some((part) => /^server_/i.test(part) || part === 'undefined')
  return hasLegacyScope ? 'legacy' : undefined
}

type QueueManager = Pick<RabbitManagement, 'listQueues' | 'deleteQueue'>

export interface RabbitQueueCleanupStore {
  get(key: string): Promise<unknown>
  acquire(key: string, value: string, ttlSeconds: number): Promise<boolean>
  setPersistent(key: string, value: string): Promise<unknown>
}

export interface RabbitQueueCleanupReport {
  status: 'completed' | 'already_completed' | 'lock_busy' | 'active_consumers'
  deleted: Array<{ name: string; messages: number; reason: 'baileys' | 'legacy' }>
  discardedMessages: number
  activeQueues: string[]
}

const defaultStore: RabbitQueueCleanupStore = {
  get: redisGet,
  acquire: redisSetIfNotExists,
  setPersistent: (key, value) => redisSetAndExpire(key, value, -1),
}

export class RabbitQueueCleanupMigration {
  constructor(
    private readonly manager: QueueManager = new RabbitManagement(),
    private readonly store: RabbitQueueCleanupStore = defaultStore,
    private readonly queuePrefix = UNOAPI_QUEUE_NAME,
  ) {}

  async run(): Promise<RabbitQueueCleanupReport> {
    const markerKey = rabbitQueueCleanupMarkerKey(this.queuePrefix)
    if (await this.store.get(markerKey)) {
      return { status: 'already_completed', deleted: [], discardedMessages: 0, activeQueues: [] }
    }

    const queues = await this.manager.listQueues()
    const targets = queues
      .map((queue) => ({ queue, reason: deprecatedRabbitQueueReason(queue.name, this.queuePrefix) }))
      .filter((item): item is { queue: RabbitQueue; reason: 'baileys' | 'legacy' } => !!item.reason)

    const activeQueues = targets
      .filter(({ queue }) => queue.consumers > 0 || queue.messages_unacknowledged > 0)
      .map(({ queue }) => queue.name)
    if (activeQueues.length) {
      logger.warn(
        'RabbitMQ cleanup migration blocked by active deprecated queues: %s',
        activeQueues.join(','),
      )
      return { status: 'active_consumers', deleted: [], discardedMessages: 0, activeQueues }
    }

    const lockKey = rabbitQueueCleanupLockKey(this.queuePrefix)
    const acquired = await this.store.acquire(lockKey, randomUUID(), 600)
    if (!acquired) {
      return { status: 'lock_busy', deleted: [], discardedMessages: 0, activeQueues: [] }
    }

    const deleted: RabbitQueueCleanupReport['deleted'] = []
    for (const { queue, reason } of targets) {
      await this.manager.deleteQueue(queue.name)
      deleted.push({ name: queue.name, messages: queue.messages, reason })
      logger.warn(
        'RabbitMQ cleanup migration deleted queue=%s reason=%s discarded_messages=%s',
        queue.name,
        reason,
        queue.messages,
      )
    }

    const report: RabbitQueueCleanupReport = {
      status: 'completed',
      deleted,
      discardedMessages: deleted.reduce((total, item) => total + item.messages, 0),
      activeQueues: [],
    }
    await this.store.setPersistent(markerKey, JSON.stringify({
      ...report,
      completedAt: new Date().toISOString(),
    }))
    return report
  }
}

export const runRabbitQueueCleanupMigration = async (
  migration: Pick<RabbitQueueCleanupMigration, 'run'> = new RabbitQueueCleanupMigration(),
): Promise<RabbitQueueCleanupReport> => {
  const report = await migration.run()
  logger.info(
    'RabbitMQ cleanup migration status=%s deleted=%s discarded_messages=%s',
    report.status,
    report.deleted.length,
    report.discardedMessages,
  )
  return report
}
