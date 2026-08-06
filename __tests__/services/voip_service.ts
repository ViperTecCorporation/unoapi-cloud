import { normalizeVoipMaxConcurrentCalls, VoipService, VoipServiceError } from '../../src/services/voip_service'

describe('VoipService', () => {
  test('normalizes line concurrency to the supported range', () => {
    expect(normalizeVoipMaxConcurrentCalls(undefined)).toBe(2)
    expect(normalizeVoipMaxConcurrentCalls(0)).toBe(2)
    expect(normalizeVoipMaxConcurrentCalls(1)).toBe(1)
    expect(normalizeVoipMaxConcurrentCalls(99)).toBe(32)
  })

  test('aggregates console, bridge and call state without exposing the internal token', async () => {
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer internal-secret')
      const payload = url.endsWith('/v1/console/bootstrap')
        ? {
          config: {
            extensions: [{ id: '1001' }],
            users: [{ id: 'legacy-user' }],
            accounts: [{
              id: 'line-1',
              phoneNumber: '5566999554300',
              slots: [{ id: 'legacy-slot', enabled: true, mode: 'standalone', maxActiveCalls: 3 }],
            }],
            sessions: [{ id: 'session-1', accountId: 'line-1', deviceSlotIds: ['legacy-slot'] }],
          },
          auth: { role: 'admin', userId: 'legacy-user' },
          users: [{ id: 'legacy-user' }],
          zapoLines: [{ session: '5566999554300', accountId: 'line-1', slotId: 'legacy-slot' }],
        }
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
    const result = await service.bootstrap()
    expect(result).toMatchObject({
      extensions: [{ id: '1001' }],
      bridges: [{ session: '5566999554300', connected: true }],
      calls: [],
      accounts: [{ id: 'line-1', phoneNumber: '5566999554300', maxConcurrentCalls: 3 }],
      sessions: [{ id: 'session-1', accountId: 'line-1', maxConcurrentCalls: 3 }],
      zapoLines: [{ session: '5566999554300', accountId: 'line-1', maxConcurrentCalls: 3 }],
    })
    expect(result.accounts[0]).not.toHaveProperty('slots')
    expect(result.sessions[0]).not.toHaveProperty('deviceSlotIds')
    expect(result.zapoLines[0]).not.toHaveProperty('slotId')
    expect(result).not.toHaveProperty('auth')
    expect(result).not.toHaveProperty('users')
    expect(result.config).not.toHaveProperty('users')
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  test('fails explicitly when the service is not configured', async () => {
    await expect(new VoipService('', '').request('/v1/zapo/bridges')).rejects.toEqual(
      expect.objectContaining<Partial<VoipServiceError>>({ status: 503, message: 'voip_service_not_configured' }),
    )
  })

  test('opens an authenticated recording stream without converting audio to JSON', async () => {
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer internal-secret')
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    })
    const service = new VoipService('http://voip.local:3097', 'internal-secret', 1_000, fetcher as any)
    const response = await service.stream('/v1/console/history-records/record-1/recording')
    expect(response.headers.get('content-type')).toBe('audio/mpeg')
    await expect(response.arrayBuffer()).resolves.toHaveProperty('byteLength', 3)
  })

  test('preserves explicit content headers when uploading raw transfer audio', async () => {
    const body = Buffer.from([1, 2, 3])
    const fetcher = jest.fn(async (url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      expect(url).toBe('http://voip.local:3097/v1/console/extensionGroups/group-1/transfer-audio')
      expect(headers.get('Authorization')).toBe('Bearer internal-secret')
      expect(headers.get('Content-Type')).toBe('audio/mpeg')
      expect(headers.get('X-File-Name')).toBe('espera.mp3')
      expect(init.body).toBe(body)
      return new Response(JSON.stringify({ id: 'group-1', transferAudioSource: 'configured' }), { status: 200 })
    })
    const service = new VoipService('http://voip.local:3097', 'internal-secret', 1_000, fetcher as any)
    await expect(service.request('/v1/console/extensionGroups/group-1/transfer-audio', {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg', 'X-File-Name': 'espera.mp3' },
      body: body as BodyInit,
    })).resolves.toEqual({ id: 'group-1', transferAudioSource: 'configured' })
  })

  test('supports authenticated streaming requests with custom methods and headers', async () => {
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers)
      expect(init.method).toBe('GET')
      expect(headers.get('Authorization')).toBe('Bearer internal-secret')
      expect(headers.get('Accept')).toBe('audio/*')
      return new Response(new Uint8Array([4, 5]), { status: 200, headers: { 'Content-Type': 'audio/wav' } })
    })
    const service = new VoipService('http://voip.local:3097', 'internal-secret', 1_000, fetcher as any)
    const response = await service.stream('/v1/console/extensionGroups/group-1/transfer-audio', {
      method: 'GET',
      headers: { Accept: 'audio/*' },
    })
    expect(response.headers.get('content-type')).toBe('audio/wav')
  })
})
