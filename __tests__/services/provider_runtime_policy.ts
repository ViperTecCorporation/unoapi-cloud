import {
  BAILEYS_RUNTIME_ENABLED,
  isProviderRuntimeEnabled,
  providerRuntimeStatus,
} from '../../src/services/providers/provider_runtime_policy'

describe('provider runtime policy', () => {
  test('keeps Zapo enabled and Baileys suppressed', () => {
    expect(BAILEYS_RUNTIME_ENABLED).toBe(false)
    expect(isProviderRuntimeEnabled('zapo')).toBe(true)
    expect(isProviderRuntimeEnabled('baileys')).toBe(false)
    expect(isProviderRuntimeEnabled('forwarder')).toBe(false)
  })

  test('forces a suppressed provider to appear offline', () => {
    expect(providerRuntimeStatus('baileys', 'online')).toBe('offline')
    expect(providerRuntimeStatus('zapo', 'online')).toBe('online')
  })
})
