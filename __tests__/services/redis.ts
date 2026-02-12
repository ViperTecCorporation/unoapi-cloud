const store = new Map<string, string>()

const mockClient: any = {
  connect: jest.fn(async () => {}),
  on: jest.fn(),
  ping: jest.fn(async () => 'PONG'),
  get: jest.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
  set: jest.fn(async (key: string, value: string, opts?: { NX?: boolean; EX?: number }) => {
    if (opts?.NX && store.has(key)) return null
    store.set(key, value)
    return 'OK'
  }),
  del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  expire: jest.fn(async () => 1),
  __reset: () => {
    store.clear()
    mockClient.get.mockClear()
    mockClient.set.mockClear()
    mockClient.del.mockClear()
    mockClient.expire.mockClear()
    mockClient.ping.mockClear()
  },
}

jest.mock('@redis/client', () => ({
  createClient: jest.fn(() => mockClient),
}))

process.env.REDIS_URL = 'redis://mock'

import { getProviderId, getUnoId, setUnoId } from '../../src/services/redis'

describe('redis.setUnoId', () => {
  beforeEach(() => {
    mockClient.__reset()
  })

  it('avoids duplicate uno ids for the same provider id', async () => {
    const phone = '5566996269251'
    const idBaileys = '3EB0E218CAA9D99ABAFE03'
    const unoA = 'd1e105c0-0151-11f1-8086-41fa32916297'
    const unoB = 'cfc5edf0-0151-11f1-8086-41fa32916297'

    await Promise.all([
      setUnoId(phone, idBaileys, unoA),
      setUnoId(phone, idBaileys, unoB),
    ])

    const chosen = await getUnoId(phone, idBaileys)
    expect(chosen).toBeTruthy()
    expect([unoA, unoB]).toContain(chosen)

    const provider = await getProviderId(phone, chosen!)
    expect(provider).toBe(idBaileys)

    const other = chosen === unoA ? unoB : unoA
    const otherProvider = await getProviderId(phone, other)
    expect(otherProvider).toBeFalsy()
  })
})
