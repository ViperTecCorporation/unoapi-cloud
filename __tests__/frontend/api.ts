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
})
