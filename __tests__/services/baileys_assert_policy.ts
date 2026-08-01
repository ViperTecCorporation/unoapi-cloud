import { BAILEYS_ASSERT_POLICY } from '../../src/services/baileys_assert_policy'

describe('Baileys assert policy', () => {
  test('keeps the current recovery safeguards as an internal frozen policy', () => {
    expect(BAILEYS_ASSERT_POLICY).toEqual({
      receiptRetryCooldownMs: 15_000,
      receiptRetryMaxTargets: 400,
      selfHealOnDecryptStub: true,
      periodicEnabled: false,
      periodicIntervalMs: 7_200_000,
      periodicMaxTargets: 75,
      periodicRecentWindowMs: 3_600_000,
      periodicForce: false,
      periodicIncludeGroups: false,
      oneToOnePreassertEnabled: true,
      oneToOnePreassertCooldownMs: 0,
      oneToOnePreassertRedisTtlSec: 0,
      oneToOneAssertProbeEnabled: false,
      oneToOnePurgeDeviceList: false,
      signalSessionPurgeEnabled: false,
      signalCacheSafeMode: false,
    })
    expect(Object.isFrozen(BAILEYS_ASSERT_POLICY)).toBe(true)
  })
})
