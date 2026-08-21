import { randomUUID } from 'crypto'

type ScanReply = { cursor?: string | number; keys?: string[] } | [string | number, string[]]

export type SessionPhoneIndexClient = {
  scan: (cursor: number, options: { MATCH: string; COUNT: number }) => Promise<ScanReply>
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, options?: { NX?: boolean; EX?: number }) => Promise<string | null>
  mGet: (keys: string[]) => Promise<Array<string | null>>
  sAdd: (key: string, members: string | string[]) => Promise<number>
  sMembers: (key: string) => Promise<string[]>
  sRem: (key: string, members: string | string[]) => Promise<number>
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>
}

export type SessionPhoneIndexOptions = {
  indexKey: string
  readyKey: string
  lockKey: string
  configPrefix: string
  scanCount?: number
  lockTtlSeconds?: number
  waitTimeoutMs?: number
  waitIntervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

const releaseLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`

export const scanAllRedisKeys = async (
  client: Pick<SessionPhoneIndexClient, 'scan'>,
  pattern: string,
  count = 1000,
): Promise<string[]> => {
  let cursor = 0
  const keys = new Set<string>()
  do {
    const response = await client.scan(cursor, { MATCH: pattern, COUNT: Math.max(10, count) })
    cursor = Number(Array.isArray(response) ? response[0] : (response.cursor ?? 0))
    const batch = Array.isArray(response) ? response[1] : (response.keys || [])
    for (const key of batch) keys.add(key)
  } while (cursor !== 0)
  return [...keys]
}

export class SessionPhoneIndex {
  private readonly scanCount: number
  private readonly lockTtlSeconds: number
  private readonly waitTimeoutMs: number
  private readonly waitIntervalMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private readonly client: SessionPhoneIndexClient,
    private readonly options: SessionPhoneIndexOptions,
  ) {
    this.scanCount = Math.max(10, options.scanCount || 1000)
    this.lockTtlSeconds = Math.max(10, options.lockTtlSeconds || 120)
    this.waitTimeoutMs = Math.max(100, options.waitTimeoutMs || 130_000)
    this.waitIntervalMs = Math.max(10, options.waitIntervalMs || 100)
    this.sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  async list(): Promise<string[]> {
    await this.ensureReady()
    const indexed = [...new Set(await this.client.sMembers(this.options.indexKey))]
      .filter((phone) => this.isSessionPhone(phone))
    if (indexed.length === 0) return []

    const configs = await this.client.mGet(indexed.map((phone) => this.configKey(phone)))
    const valid: string[] = []
    const stale: string[] = []
    indexed.forEach((phone, index) => {
      if (configs[index]) valid.push(phone)
      else stale.push(phone)
    })
    if (stale.length > 0) await this.client.sRem(this.options.indexKey, stale)
    return valid
  }

  private async ensureReady(): Promise<void> {
    const deadline = Date.now() + this.waitTimeoutMs
    while (Date.now() < deadline) {
      if (await this.client.get(this.options.readyKey)) return

      const token = randomUUID()
      const acquired = await this.client.set(this.options.lockKey, token, {
        NX: true,
        EX: this.lockTtlSeconds,
      })
      if (acquired) {
        try {
          const keys = await scanAllRedisKeys(
            this.client,
            `${this.options.configPrefix}*`,
            this.scanCount,
          )
          const phones = keys
            .filter((key) => key.startsWith(this.options.configPrefix))
            .map((key) => key.slice(this.options.configPrefix.length))
            .filter((phone) => this.isSessionPhone(phone))
          if (phones.length > 0) await this.client.sAdd(this.options.indexKey, [...new Set(phones)])
          await this.client.set(this.options.readyKey, '1')
        } finally {
          try {
            await this.client.eval(releaseLockScript, {
              keys: [this.options.lockKey],
              arguments: [token],
            })
          } catch {}
        }
        return
      }

      await this.sleep(this.waitIntervalMs)
    }
    throw new Error('session_phone_index_migration_timeout')
  }

  private configKey(phone: string): string {
    return `${this.options.configPrefix}${phone}`
  }

  private isSessionPhone(phone: string): boolean {
    return !!phone && phone !== 'auth-token-index'
  }
}
