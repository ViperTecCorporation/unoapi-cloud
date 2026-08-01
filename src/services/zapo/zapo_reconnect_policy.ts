import { SendError } from '../send_error'

const MAX_RECONNECT_DELAY_MS = 60_000
const MAX_EXPONENT = 6

export const zapoReconnectDelay = (attempt: number, configuredDelayMs: number): number => {
  const baseDelay = Math.max(1_000, configuredDelayMs)
  const exponent = Math.max(0, Math.min(attempt, MAX_EXPONENT))
  return Math.min(MAX_RECONNECT_DELAY_MS, baseDelay * (2 ** exponent))
}

export const isZapoOwnershipConflict = (error: unknown): error is SendError => (
  error instanceof SendError
  && error.code === 409
  && error.title.startsWith('zapo_session_owned_by_another_worker:')
)
