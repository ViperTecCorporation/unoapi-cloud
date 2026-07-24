import { createZapoProxyOptions } from '../../src/services/zapo/zapo_proxy'

describe('zapo proxy', () => {
  test('returns undefined when proxy is not configured', () => {
    expect(createZapoProxyOptions()).toBeUndefined()
    expect(createZapoProxyOptions('   ')).toBeUndefined()
  })

  test('shares the configured proxy across websocket, CDN and link preview', () => {
    const agent = { addRequest: jest.fn() }
    const createAgent = jest.fn(() => agent as never)

    const result = createZapoProxyOptions(' socks5://user:pass@proxy.local:1080 ', createAgent)

    expect(createAgent).toHaveBeenCalledWith('socks5://user:pass@proxy.local:1080')
    expect(result).toEqual({
      ws: agent,
      mediaUpload: agent,
      mediaDownload: agent,
      linkPreview: agent,
    })
  })
})
