import {
  DEFAULT_WHATSAPP_ENGINE,
  resolveSessionProvider,
  resolveWhatsAppEngine,
} from '../../src/services/providers/provider_resolver'

describe('provider resolver', () => {
  test('uses Baileys when the session has no provider', () => {
    expect(resolveSessionProvider(undefined)).toBe(DEFAULT_WHATSAPP_ENGINE)
  })

  test('keeps Zapo when selected by the session', () => {
    expect(resolveSessionProvider('zapo')).toBe('zapo')
  })

  test('keeps forwarder as provider but routes it through the suppressed Baileys worker', () => {
    expect(resolveSessionProvider('forwarder')).toBe('forwarder')
    expect(resolveWhatsAppEngine('forwarder')).toBe('baileys')
  })

  test('falls back to Zapo for an invalid provider', () => {
    expect(resolveSessionProvider('unknown')).toBe('zapo')
  })
})
