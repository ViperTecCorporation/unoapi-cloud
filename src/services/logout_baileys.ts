import { Listener } from '../services/listener'
import { configs, getConfig } from '../services/config'
import { clients, getClient } from '../services/client'
import { OnNewLogin } from '../services/socket'
import { Logout } from './logout'
import logger from './logger'
import { stores } from './store'
import { dataStores } from './data_store'
import { mediaStores } from './media_store'
import { delSessionStatus } from './redis'

export class LogoutBaileys implements Logout {
  private getClient: getClient
  private getConfig: getConfig
  private listener: Listener
  private onNewLogin: OnNewLogin

  constructor(getClient: getClient, getConfig: getConfig, listener: Listener, onNewLogin: OnNewLogin) {
    this.getClient = getClient
    this.getConfig = getConfig
    this.listener = listener
    this.onNewLogin = onNewLogin
  }

  async run(phone: string) {
    logger.debug('Logout baileys for phone %s', phone)
    try {
      const stack = new Error('logout_trace').stack
      logger.warn('LogoutBaileys.run invoked for %s stack=%s', phone, stack)
    } catch {}
    const config = await this.getConfig(phone)
    const store = await config.getStore(phone, config)
    const { sessionStore, dataStore } = store
    const existingClient = clients.get(phone)
    const shouldForceLogout =
      !!existingClient ||
      await sessionStore.isStatusOnline(phone) ||
      await sessionStore.isStatusConnecting(phone) ||
      await sessionStore.isStatusRestartRequired(phone)

    if (shouldForceLogout) {
      const client = existingClient || await this.getClient({
        phone,
        listener: this.listener,
        getConfig: this.getConfig,
        onNewLogin: this.onNewLogin,
      })
      try {
        await client.logout()
      } catch (e) {
        logger.warn(e as any, 'Ignore error while forcing Baileys logout for %s', phone)
      }
    }
    await dataStore.cleanSession(true)
    clients.delete(phone)
    stores.delete(phone)
    dataStores.delete(phone)
    mediaStores.delete(phone)
    configs.delete(phone)
    if (config.useRedis) {
      await delSessionStatus(phone)
    } else {
      await sessionStore.setStatus(phone, 'disconnected')
    }
  }
}
