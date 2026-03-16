import logger from '../services/logger'
import { Logout } from '../services/logout'

export class LogoutJob {
  private logout: Logout
  private static inFlight: Set<string> = new Set()

  constructor(logout: Logout) {
    this.logout = logout
  }

  async consume(_: string, payload: { phone: string, ts?: number, source?: string }) {
    const { phone, ts, source } = payload || ({} as any)
    if (!phone) return
    if (LogoutJob.inFlight.has(phone)) {
      logger.warn('Skip duplicated logout while another logout is in-flight for %s', phone)
      return
    }
    // Drop stale queue messages to avoid unintended logout after a fresh pairing/reconnect.
    const ageMs = ts ? (Date.now() - ts) : 0
    if (ts && ageMs > 120000) {
      logger.warn('Skip stale logout message for %s (ageMs=%s source=%s)', phone, ageMs, source || 'unknown')
      return
    }
    LogoutJob.inFlight.add(phone)
    logger.debug('Logout service for phone %s (source=%s ageMs=%s)', phone, source || 'unknown', ageMs)
    try {
      await this.logout.run(phone)
    } finally {
      LogoutJob.inFlight.delete(phone)
    }
  }
}
