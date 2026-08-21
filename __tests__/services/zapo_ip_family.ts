import http from 'node:http'
import type { LookupFunction } from 'node:net'
import {
  createZapoFamilyAgent,
  createZapoOrderedLookup,
  resolveZapoIpFamilyPolicies,
  ZapoDualProtocolFamilyAgent,
} from '../../src/services/zapo/zapo_ip_family'

describe('Zapo IP family policy', () => {
  test('keeps every channel on auto when no environment override is configured', () => {
    expect(resolveZapoIpFamilyPolicies()).toEqual({
      ws: 'auto',
      mediaUpload: 'auto',
      mediaDownload: 'auto',
      linkPreview: 'auto',
    })
  })

  test('lets blank channel values inherit the global policy', () => {
    expect(resolveZapoIpFamilyPolicies({
      network: ' IPv6First ',
      chatSocket: '',
      mediaUpload: '   ',
    })).toEqual({
      ws: 'ipv6first',
      mediaUpload: 'ipv6first',
      mediaDownload: 'ipv6first',
      linkPreview: 'ipv6first',
    })
  })

  test('applies channel overrides before the global policy', () => {
    expect(resolveZapoIpFamilyPolicies({
      network: 'ipv6first',
      chatSocket: 'auto',
      mediaDownload: 'ipv4first',
    })).toEqual({
      ws: 'auto',
      mediaUpload: 'ipv6first',
      mediaDownload: 'ipv4first',
      linkPreview: 'ipv6first',
    })
  })

  test('rejects an invalid global or channel value explicitly', () => {
    expect(() => resolveZapoIpFamilyPolicies({ network: 'ipv6only' }))
      .toThrow('ZAPO_NETWORK_IP_FAMILY must be one of: auto, ipv6first, ipv4first')
    expect(() => resolveZapoIpFamilyPolicies({ mediaUpload: 'prefer-v6' }))
      .toThrow('ZAPO_MEDIA_UPLOAD_IP_FAMILY must be one of: auto, ipv6first, ipv4first')
  })

  test('orders DNS results without dropping the alternate family used by Node fallback', () => {
    const resolver = jest.fn((_hostname, options, callback) => {
      callback(null, [
        { address: '2001:db8::10', family: 6 },
        { address: '192.0.2.10', family: 4 },
      ])
    }) as unknown as LookupFunction
    const callback = jest.fn()

    createZapoOrderedLookup('ipv6first', resolver)('web.whatsapp.com', { all: true, family: 0 }, callback)

    expect(resolver).toHaveBeenCalledWith(
      'web.whatsapp.com',
      { all: true, family: 0, order: 'ipv6first' },
      callback,
    )
    expect(callback).toHaveBeenCalledWith(null, [
      { address: '2001:db8::10', family: 6 },
      { address: '192.0.2.10', family: 4 },
    ])
  })

  test('opens both HTTP and TLS sockets with family fallback enabled', () => {
    const socket = {} as never
    const socketFactory = jest.fn(() => socket)
    const agent = new ZapoDualProtocolFamilyAgent('ipv6first', socketFactory)

    expect(agent.connect({} as never, {
      secureEndpoint: false,
      host: 'example.com',
      port: 80,
    })).toBe(socket)
    expect(agent.connect({} as never, {
      secureEndpoint: true,
      host: 'web.whatsapp.com',
      port: 443,
    })).toBe(socket)

    expect(socketFactory).toHaveBeenNthCalledWith(1, false, expect.objectContaining({
      host: 'example.com',
      port: 80,
      family: 0,
      autoSelectFamily: true,
      lookup: expect.any(Function),
    }))
    expect(socketFactory).toHaveBeenNthCalledWith(2, true, expect.objectContaining({
      host: 'web.whatsapp.com',
      port: 443,
      servername: 'web.whatsapp.com',
      family: 0,
      autoSelectFamily: true,
      lookup: expect.any(Function),
    }))
  })

  test('reuses the process-wide direct agent for the same effective policy', () => {
    expect(createZapoFamilyAgent('ipv6first')).toBe(createZapoFamilyAgent('ipv6first'))
    expect(createZapoFamilyAgent('ipv4first')).toBe(createZapoFamilyAgent('ipv4first'))
    expect(createZapoFamilyAgent('ipv6first')).not.toBe(createZapoFamilyAgent('ipv4first'))
  })

  test('falls back to IPv4 when the preferred IPv6 address is unavailable', async () => {
    const server = http.createServer((_request, response) => response.end('ok'))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('test server did not expose a TCP port')
      const resolver = jest.fn((_hostname, options, callback) => {
        if (options.all) {
          callback(null, [
            { address: '::1', family: 6 },
            { address: '127.0.0.1', family: 4 },
          ])
          return
        }
        callback(null, '::1', 6)
      }) as unknown as LookupFunction
      const agent = new ZapoDualProtocolFamilyAgent('ipv6first', undefined, resolver)

      const remoteFamily = await new Promise<string | undefined>((resolve, reject) => {
        const request = http.get({
          host: 'zapo-family-fallback.test',
          port: address.port,
          agent,
        }, (response) => {
          const family = response.socket.remoteFamily
          response.resume()
          response.once('end', () => resolve(family))
        })
        request.once('error', reject)
      })

      expect(remoteFamily).toBe('IPv4')
      expect(resolver).toHaveBeenCalledWith(
        'zapo-family-fallback.test',
        expect.objectContaining({ all: true, family: 0, order: 'ipv6first' }),
        expect.any(Function),
      )
      agent.destroy()
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})
