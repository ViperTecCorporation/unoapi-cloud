import {
  isWebhookCircuitOpenError,
  WebhookCircuitOpenError,
  webhookRetryCount,
} from '../../src/services/webhook_circuit_breaker'

describe('webhook circuit breaker retry policy', () => {
  test('does not consume a retry when the open circuit skips delivery', () => {
    const error = new WebhookCircuitOpenError('circuit open', 120_000)

    expect(isWebhookCircuitOpenError(error)).toBe(true)
    expect(webhookRetryCount(3, error)).toBe(2)
  })

  test('consumes a retry when a real delivery failure opens the circuit', () => {
    const error = new WebhookCircuitOpenError('circuit opened after failure', 120_000, true)

    expect(webhookRetryCount(3, error)).toBe(3)
  })

  test('does not alter retries for unrelated failures', () => {
    expect(isWebhookCircuitOpenError(new Error('network failure'))).toBe(false)
    expect(webhookRetryCount(3, new Error('network failure'))).toBe(3)
  })
})
