import { BoundedTtlMap, BoundedTtlSet } from '../../src/utils/bounded_ttl_cache'

describe('BoundedTtlMap', () => {
  test('expires entries after the configured TTL', () => {
    let now = 1_000
    const cache = new BoundedTtlMap<string, string>({ maxEntries: 2, ttlMs: 100, now: () => now })
    cache.set('a', 'one')

    now = 1_100

    expect(cache.get('a')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  test('evicts the oldest entry and refreshes insertion order on update', () => {
    const cache = new BoundedTtlMap<string, string>({ maxEntries: 2, ttlMs: 1_000 })
    cache.set('a', 'one').set('b', 'two').set('a', 'updated').set('c', 'three')

    expect(cache.get('a')).toBe('updated')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe('three')
  })
})

describe('BoundedTtlSet', () => {
  test('stays bounded and remains iterable', () => {
    const values = new BoundedTtlSet<string>({ maxEntries: 2, ttlMs: 1_000 })
    values.add('first').add('second').add('third')

    expect([...values]).toEqual(['second', 'third'])
    expect(values.has('first')).toBe(false)
    expect(values.size).toBe(2)
  })
})
