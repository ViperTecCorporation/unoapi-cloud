const { normalizeRelayEndpoints } = require('../../vendor/zapo-voip/dist/relay/relay-endpoints.js')

describe('vendored Zapo VoIP relay selection', () => {
  const baseRelay = {
    ip: '57.144.233.57',
    port: 3478,
    token: 'token',
    rawToken: new Uint8Array([1, 2, 3]),
    key: 'key',
    relayId: 1,
    relayName: 'gru2c01',
  }

  test('adds the web-token 3480 variant for authTokenId zero', () => {
    const relays = normalizeRelayEndpoints([{ ...baseRelay, authTokenId: '0' }])

    expect(relays.map((relay: any) => [relay.port, relay.authTokenId])).toEqual([
      [3478, '0'],
      [3480, '0-web-token'],
    ])
  })

  test('does not add 3480 for a normal relay', () => {
    const relays = normalizeRelayEndpoints([{ ...baseRelay, authTokenId: '4' }])

    expect(relays).toHaveLength(1)
    expect(relays[0].port).toBe(3478)
  })
})
