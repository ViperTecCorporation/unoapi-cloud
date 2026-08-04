const WA_RELAY_PORT = 3478;
const WEB_RELAY_PORT = 3480;
export function normalizeRelayEndpoints(endpoints) {
    const seen = new Set();
    const uniqueEndpoints = [];
    for (const endpoint of endpoints) {
        if ((endpoint.protocol ?? 0) !== 0)
            continue;
        const key = `${endpoint.ip}:${endpoint.port}:${endpoint.authTokenId ?? ''}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        uniqueEndpoints.push(endpoint);
    }
    return uniqueEndpoints
        .filter((endpoint) => endpoint.key && endpoint.rawToken)
        .flatMap((endpoint) => {
        const baseName = endpoint.relayName || endpoint.ip;
        const variants = [
            {
                ip: endpoint.ip,
                port: WA_RELAY_PORT,
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
        ];
        const needsWebTokenFallback = endpoint.authTokenId === '0' || /^fops/i.test(endpoint.relayName || '');
        if (needsWebTokenFallback) {
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
            });
        }
        return variants;
    });
}
