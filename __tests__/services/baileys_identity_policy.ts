import { BAILEYS_IDENTITY_POLICY } from '../../src/services/baileys_identity_policy'

describe('Baileys identity policy', () => {
  test('keeps LID to PN enrichment bounded and internal', () => {
    expect(BAILEYS_IDENTITY_POLICY).toEqual({
      lidResolverEnabled: true,
      lidResolverBackoffMs: [30_000, 120_000, 300_000],
      lidResolverSweepIntervalMs: 600_000,
      lidResolverMaxPending: 2_000,
    })
    expect(Object.isFrozen(BAILEYS_IDENTITY_POLICY)).toBe(true)
    expect(Object.isFrozen(BAILEYS_IDENTITY_POLICY.lidResolverBackoffMs)).toBe(true)
  })
})
