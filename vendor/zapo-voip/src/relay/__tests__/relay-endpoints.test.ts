import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeRelayEndpoints, selectMediaRelayEndpoint } from '../relay-endpoints.js'

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

test('preserves the relay port advertised by the offer ACK', () => {
    const relays = normalizeRelayEndpoints([
        {
            ip: '57.144.233.57',
            port: 3499,
            token: 'token',
            rawToken,
            key: 'key',
            relayId: 1,
            relayName: 'gru2c01',
            authTokenId: '4'
        }
    ])

    assert.equal(relays.length, 1)
    assert.equal(relays[0]?.port, 3499)
})

test('does not duplicate the web-token fallback when ACK already advertises 3480', () => {
    const relays = normalizeRelayEndpoints([
        {
            ip: '57.144.233.57',
            port: 3480,
            token: 'token',
            rawToken,
            key: 'key',
            relayId: 1,
            relayName: 'fops-gru',
            authTokenId: '0'
        }
    ])

    assert.deepEqual(relays.map((relay) => relay.port), [3480])
})

test('can disable synthetic 3480 and keep only the endpoint advertised by the ACK', () => {
    const relays = normalizeRelayEndpoints(
        [
            {
                ip: '57.144.233.57',
                port: 3478,
                token: 'token',
                rawToken,
                key: 'key',
                relayId: 1,
                relayName: 'gru2c01',
                authTokenId: '0'
            }
        ],
        { includeWebTokenFallback: false }
    )

    assert.deepEqual(relays.map((relay) => relay.port), [3478])
})

test('selects the FNA relay for incoming media', () => {
    const regular = {
        ip: '57.144.233.57',
        port: 3478,
        token: 'token',
        rawToken,
        key: 'key',
        relayId: 1,
        relayName: 'regular',
        authTokenId: '4',
        isFna: false
    }
    const fna = {
        ...regular,
        ip: '157.240.12.63',
        relayId: 2,
        relayName: 'fna',
        authTokenId: '0',
        isFna: true
    }

    assert.equal(selectMediaRelayEndpoint([regular, fna], true), fna)
})

test('selects the authenticated non-FNA relay for outgoing media', () => {
    const fallback = {
        ip: '57.144.233.57',
        port: 3478,
        token: 'token',
        rawToken,
        key: 'key',
        relayId: 1,
        relayName: 'fallback',
        authTokenId: '0',
        isFna: false
    }
    const authenticated = {
        ...fallback,
        ip: '157.240.12.63',
        relayId: 2,
        relayName: 'authenticated',
        authTokenId: '4'
    }

    assert.equal(selectMediaRelayEndpoint([fallback, authenticated], false), authenticated)
})
