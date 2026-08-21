import { SessionPhoneIndex, SessionPhoneIndexClient, scanAllRedisKeys } from '../../src/services/session_phone_index'

type ScanPage = { cursor: string; keys: string[] }

class FakeRedis implements SessionPhoneIndexClient {
  strings = new Map<string, string>()
  sets = new Map<string, Set<string>>()
  scanPages: ScanPage[] = [{ cursor: '0', keys: [] }]
  scanCalls: Array<{ cursor: number; options: { MATCH: string; COUNT: number } }> = []
  onScan?: (call: number) => void | Promise<void>
  failScan?: Error

  async scan(cursor: number, options: { MATCH: string; COUNT: number }) {
    this.scanCalls.push({ cursor, options })
    if (this.failScan) throw this.failScan
    await this.onScan?.(this.scanCalls.length)
    return this.scanPages[this.scanCalls.length - 1] || { cursor: '0', keys: [] }
  }

  async get(key: string) {
    return this.strings.get(key) || null
  }

  async set(key: string, value: string, options?: { NX?: boolean; EX?: number }) {
    if (options?.NX && this.strings.has(key)) return null
    this.strings.set(key, value)
    return 'OK'
  }

  async mGet(keys: string[]) {
    return keys.map((key) => this.strings.get(key) || null)
  }

  async sAdd(key: string, members: string | string[]) {
    const values = Array.isArray(members) ? members : [members]
    const set = this.sets.get(key) || new Set<string>()
    const before = set.size
    values.forEach((member) => set.add(member))
    this.sets.set(key, set)
    return set.size - before
  }

  async sMembers(key: string) {
    return [...(this.sets.get(key) || [])]
  }

  async sRem(key: string, members: string | string[]) {
    const values = Array.isArray(members) ? members : [members]
    const set = this.sets.get(key) || new Set<string>()
    let removed = 0
    values.forEach((member) => { if (set.delete(member)) removed += 1 })
    return removed
  }

  async eval(_script: string, options: { keys: string[]; arguments: string[] }) {
    const [key] = options.keys
    if (this.strings.get(key) !== options.arguments[0]) return 0
    this.strings.delete(key)
    return 1
  }
}

const options = {
  indexKey: 'unoapi-sessions:index',
  readyKey: 'unoapi-sessions:index:ready',
  lockKey: 'unoapi-sessions:index:migration-lock',
  configPrefix: 'unoapi-config:',
  scanCount: 25,
}

describe('scanAllRedisKeys', () => {
  it('walks every cursor and removes duplicate keys without using KEYS', async () => {
    const redis = new FakeRedis()
    redis.scanPages = [
      { cursor: '17', keys: ['unoapi-config:5511', 'unoapi-config:5512'] },
      { cursor: '0', keys: ['unoapi-config:5512', 'unoapi-config:5513'] },
    ]

    await expect(scanAllRedisKeys(redis, 'unoapi-config:*', 25)).resolves.toEqual([
      'unoapi-config:5511',
      'unoapi-config:5512',
      'unoapi-config:5513',
    ])
    expect(redis.scanCalls).toEqual([
      { cursor: 0, options: { MATCH: 'unoapi-config:*', COUNT: 25 } },
      { cursor: 17, options: { MATCH: 'unoapi-config:*', COUNT: 25 } },
    ])
  })
})

describe('SessionPhoneIndex', () => {
  it('returns a ready index, validates configs and removes stale members', async () => {
    const redis = new FakeRedis()
    redis.strings.set(options.readyKey, '1')
    redis.strings.set('unoapi-config:5511', '{}')
    await redis.sAdd(options.indexKey, ['5511', 'stale'])

    const index = new SessionPhoneIndex(redis, options)

    await expect(index.list()).resolves.toEqual(['5511'])
    await expect(redis.sMembers(options.indexKey)).resolves.toEqual(['5511'])
    expect(redis.scanCalls).toHaveLength(0)
  })

  it('migrates a legacy keyspace once with SCAN and ignores non-session config keys', async () => {
    const redis = new FakeRedis()
    redis.scanPages = [{
      cursor: '0',
      keys: [
        'unoapi-config:5566996269251',
        'unoapi-config:+5566999424178',
        'unoapi-config:auth-token-index',
        'unoapi-config:bad/value',
      ],
    }]
    redis.strings.set('unoapi-config:5566996269251', '{}')
    redis.strings.set('unoapi-config:+5566999424178', '{}')

    const index = new SessionPhoneIndex(redis, options)

    await expect(index.list()).resolves.toEqual(['5566996269251', '+5566999424178'])
    expect(redis.strings.get(options.readyKey)).toBe('1')
    expect(redis.strings.has(options.lockKey)).toBe(false)

    await index.list()
    expect(redis.scanCalls).toHaveLength(1)
  })

  it('preserves a session added while the legacy migration is scanning', async () => {
    const redis = new FakeRedis()
    redis.scanPages = [{ cursor: '0', keys: ['unoapi-config:old-session'] }]
    redis.strings.set('unoapi-config:old-session', '{}')
    redis.onScan = async () => {
      redis.strings.set('unoapi-config:new-session', '{}')
      await redis.sAdd(options.indexKey, 'new-session')
    }

    const index = new SessionPhoneIndex(redis, options)

    await expect(index.list()).resolves.toEqual(expect.arrayContaining(['old-session', 'new-session']))
    expect((await index.list()).sort()).toEqual(['new-session', 'old-session'])
  })

  it('does not resurrect a session deleted while the legacy migration is scanning', async () => {
    const redis = new FakeRedis()
    redis.scanPages = [{ cursor: '0', keys: ['unoapi-config:deleted-session'] }]
    redis.strings.set('unoapi-config:deleted-session', '{}')
    redis.onScan = async () => {
      redis.strings.delete('unoapi-config:deleted-session')
      await redis.sRem(options.indexKey, 'deleted-session')
    }

    await expect(new SessionPhoneIndex(redis, options).list()).resolves.toEqual([])
    await expect(redis.sMembers(options.indexKey)).resolves.toEqual([])
  })

  it('waits for the active migrator instead of starting a second scan', async () => {
    const redis = new FakeRedis()
    redis.strings.set(options.lockKey, 'other-worker')
    redis.strings.set('unoapi-config:5511', '{}')
    await redis.sAdd(options.indexKey, '5511')
    let waits = 0
    const index = new SessionPhoneIndex(redis, {
      ...options,
      sleep: async () => {
        waits += 1
        redis.strings.set(options.readyKey, '1')
      },
    })

    await expect(index.list()).resolves.toEqual(['5511'])
    expect(waits).toBe(1)
    expect(redis.scanCalls).toHaveLength(0)
  })

  it('takes over migration after a stale lock disappears', async () => {
    const redis = new FakeRedis()
    redis.strings.set(options.lockKey, 'dead-worker')
    redis.strings.set('unoapi-config:5511', '{}')
    redis.scanPages = [{ cursor: '0', keys: ['unoapi-config:5511'] }]
    let waits = 0
    const index = new SessionPhoneIndex(redis, {
      ...options,
      sleep: async () => {
        waits += 1
        redis.strings.delete(options.lockKey)
      },
    })

    await expect(index.list()).resolves.toEqual(['5511'])
    expect(waits).toBe(1)
    expect(redis.scanCalls).toHaveLength(1)
  })

  it('releases the migration lock and leaves the marker unset after a SCAN failure', async () => {
    const redis = new FakeRedis()
    redis.failScan = new Error('redis temporarily unavailable')
    const index = new SessionPhoneIndex(redis, options)

    await expect(index.list()).rejects.toThrow('redis temporarily unavailable')
    expect(redis.strings.has(options.readyKey)).toBe(false)
    expect(redis.strings.has(options.lockKey)).toBe(false)
  })

  it('fails explicitly when another migrator never completes', async () => {
    const redis = new FakeRedis()
    redis.strings.set(options.lockKey, 'stuck-worker')
    let now = 0
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => now)
    const index = new SessionPhoneIndex(redis, {
      ...options,
      waitTimeoutMs: 100,
      waitIntervalMs: 10,
      sleep: async (ms) => { now += ms },
    })

    try {
      await expect(index.list()).rejects.toThrow('session_phone_index_migration_timeout')
      expect(redis.scanCalls).toHaveLength(0)
    } finally {
      dateSpy.mockRestore()
    }
  })

  it('returns an empty ready index without scanning the full database', async () => {
    const redis = new FakeRedis()
    redis.strings.set(options.readyKey, '1')

    await expect(new SessionPhoneIndex(redis, options).list()).resolves.toEqual([])
    expect(redis.scanCalls).toHaveLength(0)
  })
})
