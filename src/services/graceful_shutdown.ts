import { clients } from './client'
import logger from './logger'

export const disconnectActiveClients = async (): Promise<number> => {
  const activeClients = [...clients.entries()]
  const results = await Promise.allSettled(activeClients.map(async ([phone, client]) => {
    try {
      await client.disconnect()
    } catch (error) {
      logger.warn(error as any, 'Failed to disconnect session %s during graceful shutdown', phone)
      throw error
    }
  }))
  return results.filter(result => result.status === 'fulfilled').length
}
