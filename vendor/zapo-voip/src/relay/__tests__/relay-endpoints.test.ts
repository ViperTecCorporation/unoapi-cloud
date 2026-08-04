import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeRelayEndpoints } from '../relay-endpoints.js'

const rawToken = new Uint8Array([1, 2, 3])
const rawAuthToken = new Uint8Array([4, 5, 6])

test('adds the 3480 web-token relay variant for auth token zero', () => {
    const relays = normalizeRelayEndpoints([
        {
            ip: '57.144.233.57',
            port: 3478,
            token: 'token',
            authToken: 'auth-token',
            rawToken,
            rawAuthToken,
            key: 'key',
            relayId: 1,
            relayName: 'gru2c01',
            authTokenId: '0'
        }
    ])

    assert.deepEqual(
        relays.map((relay) => ({
            port: relay.port,
            authToken: relay.authToken,
            authTokenId: relay.authTokenId
        })),
        [
            { port: 3478, authToken: 'auth-token', authTokenId: '0' },
            { port: 3480, authToken: undefined, authTokenId: '0-web-token' }
        ]
    )
})

test('keeps only the 3478 relay when no web-token fallback is required', () => {
    const relays = normalizeRelayEndpoints([
        {
            ip: '57.144.233.57',
            port: 3478,
            token: 'token',
            rawToken,
            key: 'key',
            relayId: 1,
            relayName: 'gru2c01',
            authTokenId: '4'
        }
    ])

    assert.equal(relays.length, 1)
    assert.equal(relays[0]?.port, 3478)
})
