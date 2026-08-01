import { BAILEYS_AUTH_POLICY } from '../../src/services/baileys_auth_policy'

describe('Baileys auth policy', () => {
  test('keeps Redis and Signal maintenance bounded and internal', () => {
    expect(BAILEYS_AUTH_POLICY).toMatchObject({
      authCacheTtlMs: 5_000,
      authIndexFallbackScanLimit: 2,
      signalPruneDefaultTypes: ['pre-key'],
      signalPruneBootstrapEnabled: false,
      signalPruneDailyEnabled: false,
      signalPurgeDeviceListEnabled: false,
      signalPurgeSessionEnabled: false,
      signalPurgeSenderKeyEnabled: false,
      jidMapEnrichAuthEnabled: true,
      jidMapEnrichOnStoreEnabled: false,
    })
    expect(Object.isFrozen(BAILEYS_AUTH_POLICY)).toBe(true)
    expect(Object.isFrozen(BAILEYS_AUTH_POLICY.signalPruneDefaultTypes)).toBe(true)
  })
})
