import { BAILEYS_CONNECTION_POLICY } from '../../src/services/baileys_connection_policy'

describe('Baileys connection policy', () => {
  test('keeps connection and telemetry behavior internal and immutable', () => {
    expect(BAILEYS_CONNECTION_POLICY).toMatchObject({
      connectingTimeoutMs: 180_000,
      idleReconnectEnabled: false,
      clearAppStateSyncOnConnect: false,
      reloadDebounceMs: 15_000,
      qrTimeoutMs: 60_000,
      qrPostLoginSuppressMs: 45_000,
      validateSessionNumber: false,
      countryCode: 'BR',
      allowFullHistorySync: false,
      linkedDeviceClient: 'Unoapi',
      linkedDeviceName: 'Chrome',
      wamTelemetry: {
        enabled: true,
        debugEvents: false,
        flushIntervalMs: 5_000,
        maxEvents: 50,
      },
    })
    expect(Object.isFrozen(BAILEYS_CONNECTION_POLICY)).toBe(true)
    expect(Object.isFrozen(BAILEYS_CONNECTION_POLICY.wamTelemetry)).toBe(true)
  })
})
