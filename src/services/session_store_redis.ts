import { SessionStore, sessionStatus } from './session_store'
import { configKey, redisKeys, getSessionStatus, setSessionStatus, sessionStatusKey, redisGet, getConfig } from './redis'
import logger from './logger'

const toReplaceConfig = configKey('')
const toReplaceStatus = sessionStatusKey('')

export class SessionStoreRedis extends SessionStore {
  async getPhones(): Promise<string[]> {
    try {
      const pattern = configKey('*')
      const keys = await redisKeys(pattern)
      return keys.map((key: string) => key.replace(toReplaceConfig, ''))
    } catch (error) {
      logger.error(error, 'Erro on get configs')
      throw error
    }
  }

  async getStatus(phone: string) {
    return await getSessionStatus(phone) || 'disconnected'
  }

  async setStatus(phone: string, status: sessionStatus) {
    logger.info(`Session status ${phone} change from ${await this.getStatus(phone)} to ${status}`)
    return setSessionStatus(phone, status)
  }

  async syncConnecting() {
    logger.info(`Sync lost connecting!`)
    try {
      const pattern = sessionStatusKey('*')
      const keys = await redisKeys(pattern)
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const phone = key.replace(toReplaceStatus, '')
        if ((await redisGet(key)) == 'connecting' || !getConfig(phone) ) {
          logger.info(`Sync ${phone} lost connecting!`)
          await this.setStatus(phone, 'disconnected')
        }
      }
    } catch (error) {
      logger.error(error, 'Error on sync lost connecting')
      throw error
    }
  }
}