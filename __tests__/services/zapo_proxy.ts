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

  test('uses one family-aware agent for every channel inheriting the global policy', () => {
    const directAgent = { addRequest: jest.fn() }
    const createFamilyAgent = jest.fn(() => directAgent as never)

    const result = createZapoProxyOptions(undefined, undefined, {
      network: 'ipv6first',
    }, createFamilyAgent)

    expect(createFamilyAgent).toHaveBeenCalledTimes(1)
    expect(createFamilyAgent).toHaveBeenCalledWith('ipv6first')
    expect(result).toEqual({
      ws: directAgent,
      mediaUpload: directAgent,
      mediaDownload: directAgent,
      linkPreview: directAgent,
    })
  })

  test('omits auto channels and creates one agent per effective non-auto policy', () => {
    const agents = {
      ipv6first: { addRequest: jest.fn(), name: 'v6' },
      ipv4first: { addRequest: jest.fn(), name: 'v4' },
    }
    const createFamilyAgent = jest.fn((policy: keyof typeof agents) => agents[policy] as never)

    const result = createZapoProxyOptions(undefined, undefined, {
      network: 'ipv6first',
      chatSocket: 'auto',
      mediaDownload: 'ipv4first',
    }, createFamilyAgent)

    expect(createFamilyAgent).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      ws: undefined,
      mediaUpload: agents.ipv6first,
      mediaDownload: agents.ipv4first,
      linkPreview: agents.ipv6first,
    })
  })

  test('keeps the existing SOCKS proxy path authoritative when configured', () => {
    const proxyAgent = { addRequest: jest.fn(), name: 'proxy' }
    const createProxyAgent = jest.fn(() => proxyAgent as never)
    const createFamilyAgent = jest.fn()

    const result = createZapoProxyOptions('socks5h://proxy.local:1080', createProxyAgent, {
      network: 'ipv6first',
      mediaDownload: 'ipv4first',
    }, createFamilyAgent)

    expect(createFamilyAgent).not.toHaveBeenCalled()
    expect(result).toEqual({
      ws: proxyAgent,
      mediaUpload: proxyAgent,
      mediaDownload: proxyAgent,
      linkPreview: proxyAgent,
    })
  })

  test('validates family policies even when a SOCKS proxy is configured', () => {
    expect(() => createZapoProxyOptions('socks5h://proxy.local:1080', undefined, {
      chatSocket: 'ipv7first',
    })).toThrow('ZAPO_CHAT_SOCKET_IP_FAMILY must be one of: auto, ipv6first, ipv4first')
  })
})
