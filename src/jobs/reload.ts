import logger from '../services/logger';
import { Reload } from '../services/reload'

export class ReloadJob {
  private reload: Reload
  private static inFlight: Set<string> = new Set()

  constructor(reload: Reload) {
    this.reload = reload
  }

  async consume(_: string, { phone }: { phone: string }) {
    if (ReloadJob.inFlight.has(phone)) {
      logger.warn('Skip duplicated reload while another reload is in-flight for %s', phone)
      return
    }
    ReloadJob.inFlight.add(phone)
    logger.debug('Reload job run for phone %s', phone)
    try {
      await this.reload.run(phone)
    } finally {
      ReloadJob.inFlight.delete(phone)
    }
  }
}
