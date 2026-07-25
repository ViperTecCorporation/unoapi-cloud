import { ApiClient, ApiError } from '../../frontend/core/api'
import { digitsOnly, escapeHtml, safeImageUrl } from '../../frontend/core/html'
import { SocketBridge } from '../../frontend/core/socket'

describe('frontend core', () => {
  test('escapes HTML and normalizes digits', () => {
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;')
    expect(digitsOnly('+55 (66) 99999-0000')).toBe('5566999990000')
  })

  test('accepts safe image URLs and rejects executable schemes', () => {
    expect(safeImageUrl('https://cdn.example/avatar.jpg')).toBe('https://cdn.example/avatar.jpg')
    expect(safeImageUrl('javascript:alert(1)')).toBe('')
  })

  test('builds every session-scoped API request with authorization', async () => {
    const calls: Array<{ url: string, init?: RequestInit }> = []
    const fetcher = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: `${url}`, init })
      if (`${url}`.endsWith('/sessions')) return new Response(JSON.stringify({ data: [{ phone: '5566' }] }))
      if (`${url}`.endsWith('/version')) {
        return new Response(JSON.stringify({
          installed_version: '4.0.0-beta8',
          latest_version: '4.0.0-beta8',
          update_available: false,
          status: 'current',
          checked_at: '2026-07-25T12:00:00.000Z',
        }))
      }
      if (`${url}`.includes('/contacts?')) {
        return new Response(JSON.stringify({
          contacts: [],
          next_cursor: '0',
          has_more: false,
          total_count: 0,
        }))
      }
      if (`${url}`.endsWith('/groups')) return new Response(JSON.stringify({ phone: '5566', groups: [] }))
      if (`${url}`.endsWith('/deregister')) return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ phone: '5566', status: 'online' }))
    }) as typeof fetch
    const api = new ApiClient('https://uno.example', fetcher)
    api.setToken('secret')

    await expect(api.sessions()).resolves.toEqual([{ phone: '5566' }])
    await expect(api.versionStatus()).resolves.toMatchObject({ status: 'current' })
    await api.session('5566')
    await api.register('5566', { label: 'Teste' })
    await api.contacts('5566')
    await api.groups('5566')
    await api.saveWebhooks('5566', [{ id: 'default' }])
    await api.sendText('5566', '5511', 'Oi')
    await api.deregister('5566')

    expect(calls).toHaveLength(9)
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe('Bearer secret')
    expect(calls.map((call) => call.url)).toEqual(expect.arrayContaining([
      'https://uno.example/sessions',
      'https://uno.example/v15.0/5566/groups?cursor=0&limit=20',
      'https://uno.example/v15.0/5566/deregister',
    ]))
  })

  test('surfaces API payload errors', async () => {
    const api = new ApiClient('https://uno.example', jest.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 }),
    ) as typeof fetch)

    await expect(api.sessions()).rejects.toEqual(
      expect.objectContaining<ApiError>({ status: 401, message: 'invalid_token' }),
    )
  })

  test('subscribes socket events only for the selected session', () => {
    const listeners = new Map<string, (payload?: unknown) => void>()
    const socket = {
      connected: true,
      on: jest.fn((event: string, listener: (payload?: unknown) => void) => listeners.set(event, listener)),
      emit: jest.fn(),
    }
    const bridge = new SocketBridge('https://uno.example', jest.fn(() => socket))
    const received = jest.fn()

    bridge.subscribe('5566', received)
    listeners.get('broadcast')?.({ phone: '5577', type: 'qrcode', content: 'ignored' })
    listeners.get('broadcast')?.({ phone: '5566', type: 'qrcode', content: 'accepted' })

    expect(socket.emit).toHaveBeenCalledWith('subscribe_qr', { phone: '5566' })
    expect(received).toHaveBeenCalledTimes(1)
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ content: 'accepted' }))
  })
})
