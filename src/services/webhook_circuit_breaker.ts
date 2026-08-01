export class WebhookCircuitOpenError extends Error {
  public readonly code = 'WEBHOOK_CB_OPEN'
  public readonly delayMs: number
  public readonly consumesRetry: boolean

  constructor(message: string, delayMs: number, consumesRetry = false) {
    super(message)
    this.name = 'WebhookCircuitOpenError'
    this.delayMs = delayMs
    this.consumesRetry = consumesRetry
  }
}

export const isWebhookCircuitOpenError = (error: unknown): error is WebhookCircuitOpenError => {
  const value = error as Partial<WebhookCircuitOpenError> | undefined
  return value?.code === 'WEBHOOK_CB_OPEN' || value?.name === 'WebhookCircuitOpenError'
}

export const webhookRetryCount = (attemptCount: number, error: unknown): number => {
  if (!isWebhookCircuitOpenError(error) || (error as WebhookCircuitOpenError).consumesRetry !== false) {
    return attemptCount
  }
  return Math.max(0, attemptCount - 1)
}
