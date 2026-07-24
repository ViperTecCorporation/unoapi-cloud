import { resolveRegistrationConnectionType } from '../../src/services/providers/connection_type_policy'

describe('registration connection type policy', () => {
  test('keeps the Zapo connection type until the stored session is deregistered', () => {
    expect(resolveRegistrationConnectionType({
      hasStoredConfig: true,
      previousProvider: 'zapo',
      previousConnectionType: 'qrcode',
      requestedConnectionType: 'pairing_code',
    })).toEqual({ value: 'qrcode', locked: true })
  })

  test('accepts the selected type after deregister removed the stored config', () => {
    expect(resolveRegistrationConnectionType({
      hasStoredConfig: false,
      previousProvider: 'zapo',
      previousConnectionType: 'qrcode',
      requestedConnectionType: 'pairing_code',
    })).toEqual({ value: 'pairing_code', locked: false })
  })

  test('does not apply the Zapo lock to a Baileys session', () => {
    expect(resolveRegistrationConnectionType({
      hasStoredConfig: true,
      previousProvider: 'baileys',
      previousConnectionType: 'qrcode',
      requestedConnectionType: 'pairing_code',
    })).toEqual({ value: 'pairing_code', locked: false })
  })
})
