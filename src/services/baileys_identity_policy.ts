export const BAILEYS_IDENTITY_POLICY = Object.freeze({
  lidResolverEnabled: true,
  lidResolverBackoffMs: Object.freeze([30_000, 120_000, 300_000]),
  lidResolverSweepIntervalMs: 600_000,
  lidResolverMaxPending: 2_000,
})
