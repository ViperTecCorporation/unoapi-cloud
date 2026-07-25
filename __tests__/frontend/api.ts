import { ApiClient } from '../../frontend/core/api'

describe('frontend API client', () => {
  test('calls the browser fetch implementation with the global receiver', async () => {
    const fetcher = jest.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ phone: '5566996269251', status: 'online' }],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
    }) as unknown as typeof fetch
    const api = new ApiClient('https://unoapi.example', fetcher)
    api.setToken('secret')

    await expect(api.sessions()).resolves.toEqual([{ phone: '5566996269251', status: 'online' }])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('adds paging and search parameters to contact and group requests', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contacts: [],
            next_cursor: '0',
            has_more: false,
            total_count: 0,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            groups: [],
            paging: { cursors: { before: null, after: null } },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch
    const api = new ApiClient('https://unoapi.example', fetcher)

    await api.contacts('5566', '42', 20, ' Maria ')
    await api.groups('5566', '20', 20, ' Comercial ')

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://unoapi.example/5566/contacts?cursor=42&limit=20&search=Maria', expect.any(Object))
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://unoapi.example/v15.0/5566/groups?cursor=20&limit=20&search=Comercial', expect.any(Object))
  })

  test('lists, previews and purges RabbitMQ queues through authenticated backend routes', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ queues: [{ name: 'unoapi.outgoing' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ routing_key: '5566' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ removed: 10 }))) as unknown as typeof fetch
    const api = new ApiClient('https://unoapi.example', fetcher)
    api.setToken('admin')

    await expect(api.queues()).resolves.toEqual([{ name: 'unoapi.outgoing' }])
    await expect(api.queueMessages('unoapi.outgoing', '5566')).resolves.toEqual([{ routing_key: '5566' }])
    await expect(api.purgeQueue('unoapi.outgoing', 10)).resolves.toEqual({ removed: 10 })

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://unoapi.example/admin/rabbitmq/queues/unoapi.outgoing/messages?limit=20&session=5566',
      expect.any(Object),
    )
    expect(JSON.parse(`${fetcher.mock.calls[2][1]?.body}`)).toEqual({
      confirm: 'unoapi.outgoing',
      count: 10,
    })
  })

  test('reads and mutates Redis only through backend admin routes', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: ['unoapi:test'] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ nodes: [{ label: 'unoapi', path: 'unoapi:', kind: 'branch' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: 'unoapi:test', type: 'string', value: 'ok' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ saved: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 'string' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ removed: 1 }))) as unknown as typeof fetch
    const api = new ApiClient('https://unoapi.example', fetcher)
    api.setToken('admin')

    await expect(api.redisKeys('test')).resolves.toEqual(['unoapi:test'])
    await expect(api.redisTree()).resolves.toEqual([{ label: 'unoapi', path: 'unoapi:', kind: 'branch' }])
    await expect(api.redisKey('unoapi:test')).resolves.toMatchObject({ type: 'string' })
    await api.saveRedisKey('unoapi:test', 'string', 'value', -1)
    await expect(api.redisQuery('TYPE', ['unoapi:test'])).resolves.toBe('string')
    await expect(api.deleteRedisKey('unoapi:test')).resolves.toEqual({ removed: 1 })

    expect(JSON.parse(`${fetcher.mock.calls[3][1]?.body}`)).toMatchObject({
      confirm: 'unoapi:test',
      type: 'string',
    })
  })
})
