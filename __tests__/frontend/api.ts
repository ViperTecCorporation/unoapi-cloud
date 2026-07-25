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
})
