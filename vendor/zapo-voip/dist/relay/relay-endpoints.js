"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRelayEndpoints = normalizeRelayEndpoints;
const WA_RELAY_PORT = 3478;
const WEB_RELAY_PORT = 3480;
function normalizeRelayEndpoints(endpoints) {
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
        const advertisedPort = Number.isSafeInteger(endpoint.port) && endpoint.port > 0
            ? endpoint.port
            : WA_RELAY_PORT;
        const variants = [
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
        ];
        const needsWebTokenFallback = endpoint.authTokenId === '0' || /^fops/i.test(endpoint.relayName || '');
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
            });
        }
        return variants;
    });
}
