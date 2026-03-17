import { Request, Response } from 'express'
import { getConfig } from '../services/config'
import { setConfig } from '../services/redis'
import logger from '../services/logger'
import { Logout } from '../services/logout'
import { Reload } from '../services/reload'
import { resolveSessionPhoneByMetaId } from '../services/meta_alias'

export class RegistrationController {
  private static readonly REGISTER_DEBOUNCE_MS = 15000
  private static readonly inFlightByPhone: Set<string> = new Set()
  private static readonly lastRegisterAtByPhone: Map<string, number> = new Map()

  private getConfig: getConfig
  private logout: Logout
  private reload: Reload

  constructor(getConfig: getConfig, reload: Reload, logout: Logout) {
    this.getConfig = getConfig
    this.reload = reload
    this.logout = logout
  }

  public async register(req: Request, res: Response) {
    logger.debug('register method %s', req.method)
    logger.debug('register headers %s', JSON.stringify(req.headers))
    logger.debug('register params %s', JSON.stringify(req.params))
    logger.debug('register body %s', JSON.stringify(req.body))
    logger.debug('register query %s', JSON.stringify(req.query))
    const { phone } = req.params
    try {
      const sessionPhone = await resolveSessionPhoneByMetaId(phone)
      await setConfig(sessionPhone, req.body)
      const now = Date.now()
      const last = RegistrationController.lastRegisterAtByPhone.get(sessionPhone) || 0
      const inFlight = RegistrationController.inFlightByPhone.has(sessionPhone)
      const inDebounceWindow = (now - last) < RegistrationController.REGISTER_DEBOUNCE_MS

      if (inFlight || inDebounceWindow) {
        logger.warn(
          'register suppressed for %s (inFlight=%s debounceMs=%s)',
          sessionPhone,
          inFlight,
          Math.max(0, RegistrationController.REGISTER_DEBOUNCE_MS - (now - last))
        )
        const config = await this.getConfig(sessionPhone)
        return res.status(202).json({ ...config, registerSuppressed: true })
      }

      RegistrationController.inFlightByPhone.add(sessionPhone)
      RegistrationController.lastRegisterAtByPhone.set(sessionPhone, now)
      this.reload.run(sessionPhone)
        .catch((err) => logger.error(`register reload failed for ${sessionPhone}: ${err.message}`))
        .finally(() => {
          RegistrationController.inFlightByPhone.delete(sessionPhone)
        })

      const config = await this.getConfig(sessionPhone)
      return res.status(200).json(config)
    } catch (e) {
      return res.status(400).json({ status: 'error', message: `${phone} could not create, error: ${e.message}` })
    }
  }

  public async deregister(req: Request, res: Response) {
    logger.debug('deregister method %s', req.method)
    logger.debug('deregister headers %s', JSON.stringify(req.headers))
    logger.debug('deregister params %s', JSON.stringify(req.params))
    logger.debug('deregister body %s', JSON.stringify(req.body))
    logger.debug('deregister query %s', JSON.stringify(req.query))
    const { phone } = req.params
    const sessionPhone = await resolveSessionPhoneByMetaId(phone)
    await this.logout.run(sessionPhone)
    return res.status(204).send()
  }
}
