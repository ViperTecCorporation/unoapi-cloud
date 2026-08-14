type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export type BoundedTtlCacheOptions = {
  maxEntries: number
  ttlMs: number
  now?: () => number
}

export class BoundedTtlMap<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>()
  private readonly maxEntries: number
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(options: BoundedTtlCacheOptions) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries))
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs))
    this.now = options.now ?? Date.now
  }

  get size() {
    this.prune()
    return this.entries.size
  }

  has(key: K) {
    const entry = this.entries.get(key)
    if (!entry) return false
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return false
    }
    return true
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: K, value: V) {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
    this.prune()
    return this
  }

  delete(key: K) {
    return this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }

  *keys(): IterableIterator<K> {
    this.prune()
    yield* this.entries.keys()
  }

  private prune() {
    const now = this.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) break
      this.entries.delete(key)
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }
}

export class BoundedTtlSet<T> implements Iterable<T> {
  private readonly values: BoundedTtlMap<T, true>

  constructor(options: BoundedTtlCacheOptions) {
    this.values = new BoundedTtlMap<T, true>(options)
  }

  get size() {
    return this.values.size
  }

  has(value: T) {
    return this.values.has(value)
  }

  add(value: T) {
    this.values.set(value, true)
    return this
  }

  delete(value: T) {
    return this.values.delete(value)
  }

  clear() {
    this.values.clear()
  }

  [Symbol.iterator]() {
    return this.values.keys()
  }
}
