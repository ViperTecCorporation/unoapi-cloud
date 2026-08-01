import { BAILEYS_GROUP_POLICY } from '../../src/services/baileys_group_policy'

describe('Baileys group policy', () => {
  test('keeps group transport LID-first and Signal work bounded', () => {
    expect(BAILEYS_GROUP_POLICY).toEqual({
      membershipCheck: true,
      addressingMode: 'lid',
      preassertSessions: false,
      fallbackOrder: [],
      largeGroupThreshold: 800,
      assertChunkSize: 100,
      assertFloodWindowMs: 5_000,
      metadataRefreshEnabled: true,
      metadataRefreshDebounceMs: 1_500,
      metadataRefreshMinIntervalMs: 60_000,
      noSessionRetryBaseDelayMs: 150,
      noSessionRetryPer200DelayMs: 300,
      noSessionRetryMaxDelayMs: 2_000,
    })
    expect(Object.isFrozen(BAILEYS_GROUP_POLICY)).toBe(true)
    expect(Object.isFrozen(BAILEYS_GROUP_POLICY.fallbackOrder)).toBe(true)
  })
})
