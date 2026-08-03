import { VoipService, VoipServiceError } from '../../src/services/voip_service'

describe('VoipService', () => {
  test('aggregates console, bridge and call state without exposing the internal token', async () => {
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer internal-secret')
      const payload = url.endsWith('/v1/console/bootstrap')
        ? { config: { extensions: [{ id: '1001' }] } }
        : url.endsWith('/v1/zapo/bridges')
          ? { bridges: [{ session: '5566999554300', connected: true }] }
          : url.endsWith('/v1/zapo/calls')
            ? { calls: [] }
            : url.includes('/history?')
              ? { items: [], total: 0 }
              : { accounts: [] }
      return new Response(JSON.stringify(payload), { status: 200 })
    })
    const service = new VoipService('http://voip.local:3097', 'internal-secret', 1_000, fetcher as any)
    await expect(service.bootstrap()).resolves.toMatchObject({
      extensions: [{ id: '1001' }],
      bridges: [{ session: '5566999554300', connected: true }],
      calls: [],
    })
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  test('fails explicitly when the service is not configured', async () => {
    await expect(new VoipService('', '').request('/v1/zapo/bridges')).rejects.toEqual(
      expect.objectContaining<Partial<VoipServiceError>>({ status: 503, message: 'voip_service_not_configured' }),
    )
  })
})
