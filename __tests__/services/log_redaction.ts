import { redactLogArguments, redactLogString, redactLogValue } from '../../src/services/log_redaction'

describe('log redaction', () => {
  test('redacts bearer credentials in serialized headers', () => {
    expect(redactLogString('headers {"authorization":"Bearer secret-token","accept":"json"}'))
      .toBe('headers {"authorization":"[REDACTED]","accept":"json"}')
  })

  test('redacts nested credentials without changing operational fields', () => {
    expect(redactLogValue({
      phone: '5566999999999',
      webhook: {
        token: 'secret',
        url: 'https://example.test',
      },
    })).toEqual({
      phone: '5566999999999',
      webhook: {
        token: '[REDACTED]',
        url: 'https://example.test',
      },
    })
  })

  test('redacts every logger argument', () => {
    expect(redactLogArguments(['Authorization=abc', { apiKey: 'secret' }]))
      .toEqual(['Authorization=[REDACTED]', { apiKey: '[REDACTED]' }])
  })

  test('preserves operational error details while redacting credentials', () => {
    const error = Object.assign(new Error('request failed Authorization=secret'), {
      code: 401,
      token: 'secret',
    })

    const redacted = redactLogValue(error) as Error & { code: number, token: string }

    expect(redacted).toBeInstanceOf(Error)
    expect(redacted.message).toBe('request failed Authorization=[REDACTED]')
    expect(redacted.code).toBe(401)
    expect(redacted.token).toBe('[REDACTED]')
    expect(redacted.stack).not.toContain('Authorization=secret')
  })

  test('redacts payment secrets from serialized order details without changing the payload source', () => {
    const serialized = JSON.stringify({
      payment_settings: [
        {
          type: 'boleto',
          boleto: { digitable_line: '12345678901234567890' },
        },
        {
          type: 'pix_dynamic_code',
          pix_dynamic_code: {
            code: 'complete-pix-code',
            key: 'pix-key',
            merchant_name: 'Merchant',
          },
        },
        {
          type: 'offsite_card_pay',
          offsite_card_pay: { credential_id: 'credential-secret', last_four_digits: '1234' },
        },
      ],
      buttons: [{
        type: 'cta_copy',
        copy_code: { title: 'Copiar código PIX', code: 'complete-pix-code' },
      }],
    })

    const redacted = redactLogString(serialized)

    expect(redacted).not.toContain('12345678901234567890')
    expect(redacted).not.toContain('complete-pix-code')
    expect(redacted).not.toContain('pix-key')
    expect(redacted).not.toContain('credential-secret')
    expect(redacted).toContain('Copiar código PIX')
    expect(serialized).toContain('complete-pix-code')
    expect(redacted).toContain('Merchant')
    expect(redacted).toContain('1234')
  })

  test('redacts nested dynamic PIX and boleto fields from object log arguments', () => {
    expect(redactLogValue({
      pix_dynamic_code: { code: 'complete-pix-code', key: 'pix-key', merchant_name: 'Merchant' },
      copy_code: { title: 'Copiar código PIX', code: 'complete-pix-code' },
      boleto: { digitable_line: '12345678901234567890' },
    })).toEqual({
      pix_dynamic_code: { code: '[REDACTED]', key: '[REDACTED]', merchant_name: 'Merchant' },
      copy_code: { title: 'Copiar código PIX', code: '[REDACTED]' },
      boleto: { digitable_line: '[REDACTED]' },
    })
  })
})
