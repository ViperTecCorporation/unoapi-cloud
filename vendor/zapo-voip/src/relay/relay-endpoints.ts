import type { RelayEndpoint } from '../types.js'

const WA_RELAY_PORT = 3478
const WEB_RELAY_PORT = 3480

export interface NormalizedRelayEndpoint {
    ip: string
    port: number
    token: string
    authToken?: string
    rawAuthToken?: Uint8Array
    rawToken?: Uint8Array
    key: string
    relayId: number
    name: string
    authTokenId?: string
    isFna?: boolean
}

/**
 * Selects the single media relay used by WhatsApp Web.
 * Incoming calls must bind to the caller's FNA relay; outgoing calls prefer
 * the authenticated non-FNA relay. Allocating every advertised relay creates
 * parallel bindings and prevents the peer media from being bridged.
 */
export function selectMediaRelayEndpoint(
    endpoints: readonly RelayEndpoint[],
    incoming: boolean
): RelayEndpoint | undefined {
    const usable = endpoints.filter(
        (endpoint) => (endpoint.protocol ?? 0) === 0 && !!endpoint.key && !!endpoint.rawToken
    )

    if (incoming) {
        const fna = usable.find((endpoint) => endpoint.isFna)
        if (fna) return fna
    }

    return (
        usable.find(
            (endpoint) => !endpoint.isFna && !!endpoint.authTokenId && endpoint.authTokenId !== '0'
        ) ??
        usable.find((endpoint) => !endpoint.isFna) ??
        usable[0]
    )
}

export function normalizeRelayEndpoints(
    endpoints: readonly RelayEndpoint[],
    options: { includeWebTokenFallback?: boolean } = {}
): NormalizedRelayEndpoint[] {
    const seen = new Set<string>()
    const uniqueEndpoints: RelayEndpoint[] = []

    for (const endpoint of endpoints) {
        if ((endpoint.protocol ?? 0) !== 0) continue
        const key = `${endpoint.ip}:${endpoint.port}:${endpoint.authTokenId ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        uniqueEndpoints.push(endpoint)
    }

    return uniqueEndpoints
        .filter((endpoint) => endpoint.key && endpoint.rawToken)
        .flatMap((endpoint) => {
            const baseName = endpoint.relayName || endpoint.ip
            const advertisedPort =
                Number.isSafeInteger(endpoint.port) && endpoint.port > 0
                    ? endpoint.port
                    : WA_RELAY_PORT
            const variants: NormalizedRelayEndpoint[] = [
                {
                    ip: endpoint.ip,
                    port: advertisedPort,
                    token: endpoint.token,
                    authToken: endpoint.authToken,
                    rawAuthToken: endpoint.rawAuthToken,
                    rawToken: endpoint.rawToken,
                    key: endpoint.key,
                    relayId: endpoint.relayId,
                    name: baseName,
                    authTokenId: endpoint.authTokenId,
                    isFna: endpoint.isFna
                }
            ]

            const needsWebTokenFallback =
                options.includeWebTokenFallback !== false &&
                (endpoint.authTokenId === '0' || /^fops/i.test(endpoint.relayName || ''))

            if (needsWebTokenFallback && advertisedPort !== WEB_RELAY_PORT) {
                variants.push({
                    ip: endpoint.ip,
                    port: WEB_RELAY_PORT,
                    token: endpoint.token,
                    authToken: undefined,
                    rawAuthToken: undefined,
                    rawToken: endpoint.rawToken,
                    key: endpoint.key,
                    relayId: endpoint.relayId,
                    name: `${baseName}-web-token`,
                    authTokenId: `${endpoint.authTokenId || '0'}-web-token`,
                    isFna: endpoint.isFna
                })
            }

            return variants
        })
}
