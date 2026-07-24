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
})
