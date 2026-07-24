import type { Client, getClient } from '../client'
import { clients } from '../client'
import { getClientBaileys } from '../client_baileys'
import { ClientZapo } from '../client_zapo'
import { isZapoOwnershipConflict } from '../zapo/zapo_reconnect_policy'
import { resolveSessionProvider } from './provider_resolver'
import { listenerForProvider } from './listener_router'

const pendingZapoClients = new Map<string, Promise<Client>>()

export const getClientProvider: getClient = async (args) => {
  const existing = clients.get(args.phone)
  if (existing) return existing
  const config = await args.getConfig(args.phone)
  if (resolveSessionProvider(config.provider) !== 'zapo') return getClientBaileys(args)

  const pending = pendingZapoClients.get(args.phone)
  if (pending) return pending
  const creation = (async () => {
    const client = new ClientZapo(
      args.phone,
      listenerForProvider(args.listener, 'zapo'),
      args.getConfig,
      args.onNewLogin,
    )
    clients.set(args.phone, client)
    try {
      if (config.autoConnect) await client.connect(1)
    } catch (error) {
      if (isZapoOwnershipConflict(error)) throw error
      await client.disconnect().catch(() => undefined)
      if (clients.get(args.phone) === client) clients.delete(args.phone)
      throw error
    }
    return client as Client
  })()
  pendingZapoClients.set(args.phone, creation)
  try {
    return await creation
  } finally {
    pendingZapoClients.delete(args.phone)
  }
}
