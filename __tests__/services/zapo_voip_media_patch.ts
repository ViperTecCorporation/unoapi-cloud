const {
  patchMediaSession,
  patchRelay,
  patchRelayTypes,
} = require('../../scripts/patch-zapo-voip-media.cjs')

describe('Zapo VoIP media compatibility patch', () => {
  test('adds participant PIDs to the relay registration', () => {
    const source = `class WaSctpRelay {
    constructor() {
        this.subscriptionSsrc = 0;
    }
    setSubscriptionSsrc(ssrc) {
        this.subscriptionSsrc = ssrc;
    }
    resendSubscriptions() {}
    register(selfSsrc, peerSsrcs) {
        return buildSSRCSubscriptionList([selfSsrc], peerSsrcs, 0, 0);
    }
}`
    const patched = patchRelay(source)
    expect(patched).toContain('setParticipantPids(selfPid, peerPid)')
    expect(patched).toContain('this.selfPid, this.peerPid')
    expect(patchRelay(patched)).toBe(patched)
  })

  test('keeps 3478 primary and adds the selective 3480 web-token fallback', () => {
    const source = `class WaCallMediaSession {
    async connectRelays(endpoints) {
        const uniqueEndpoints = endpoints;
        for (const ep of endpoints) {
            const key = \`\${ep.ip}:\${ep.port}\`;
        }
        const WA_RELAY_PORT = 3478;
        const relays = uniqueEndpoints
            .filter((ep) => ep.key && ep.rawToken)
            .map((ep) => ({
            ip: ep.ip,
            port: WA_RELAY_PORT
        }));
        this.sctpRelay.setSsrc(this.selfSsrc);
        this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0);
    }
}`
    const patched = patchMediaSession(source)
    expect(patched).toContain('const WEB_RELAY_PORT = 3480')
    expect(patched).toContain("ep.authTokenId === '0'")
    expect(patched).toContain('incoming relay participant media mapped')
    expect(patched).toContain('setParticipantPids(')
    expect(patchMediaSession(patched)).toBe(patched)
  })

  test('updates the public relay type contract', () => {
    const source = '    setSubscriptionSsrc(ssrc: number): void;\n'
    const patched = patchRelayTypes(source)
    expect(patched).toContain('setParticipantPids(selfPid?: number, peerPid?: number): void;')
    expect(patchRelayTypes(patched)).toBe(patched)
  })
})
