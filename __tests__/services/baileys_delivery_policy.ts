import { BAILEYS_DELIVERY_POLICY } from '../../src/services/baileys_delivery_policy'

describe('Baileys delivery policy', () => {
  test('keeps stale-message recovery bounded and internal', () => {
    expect(BAILEYS_DELIVERY_POLICY).toEqual({
      staleRecoveryEnabled: true,
      staleRecoveryDelayMs: 45_000,
      staleRecoveryScanMs: 15_000,
      staleRecoveryMaxAttempts: 1,
      staleRecoveryMaxPending: 2_000,
      staleRecoveryBatchSize: 3,
      staleRecoveryGroups: false,
    })
    expect(Object.isFrozen(BAILEYS_DELIVERY_POLICY)).toBe(true)
  })
})
