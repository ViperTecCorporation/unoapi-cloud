export const BAILEYS_DELIVERY_POLICY = Object.freeze({
  staleRecoveryEnabled: true,
  staleRecoveryDelayMs: 45_000,
  staleRecoveryScanMs: 15_000,
  staleRecoveryMaxAttempts: 1,
  staleRecoveryMaxPending: 2_000,
  staleRecoveryBatchSize: 3,
  staleRecoveryGroups: false,
})
