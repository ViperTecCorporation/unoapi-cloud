import { initAuthCreds, proto, AuthenticationState, AuthenticationCreds, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys'
import { session } from './session'
import logger from './logger'

export const authState = async (session: session, phone: string) => {
  const { readData, readManyData, writeData, removeData, getKey } = await session(phone)

  const creds: AuthenticationCreds = ((await readData('')) || initAuthCreds()) as AuthenticationCreds

  const keys = {
    get: async (type: string, ids: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = {}
      const keys = ids.map((id) => getKey(type, id))
      let bulk: Record<string, object | undefined> | undefined
      if (readManyData && ids.length > 1) {
        try {
          bulk = await readManyData(keys)
        } catch {
          bulk = undefined
        }
      }
      if (bulk) {
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i]
          const value = bulk[keys[i]]
          if (type === 'app-state-sync-key' && value) {
            try {
              // Normalize to the expected protobuf type to avoid decrypt issues
              data[id] = proto.Message.AppStateSyncKeyData.fromObject(value as any)
            } catch {
              // Fallback to raw value if conversion fails
              data[id] = value
            }
          } else {
            data[id] = value
          }
        }
        return data
      }
      await Promise.all(
        ids.map(async (id) => {
          const key = getKey(type, id)
          const value = await readData(key)
          if (type === 'app-state-sync-key' && value) {
            try {
              // Normalize to the expected protobuf type to avoid decrypt issues
              data[id] = proto.Message.AppStateSyncKeyData.fromObject(value as any)
            } catch {
              // Fallback to raw value if conversion fails
              data[id] = value
            }
          } else {
            data[id] = value
          }
        }),
      )

      return data
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set: async (data: any) => {
      const tasks: Promise<void>[] = []
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id]
          const key = getKey(category, id)
          tasks.push(value ? writeData(key, value) : removeData(key))
        }
      }
      await Promise.all(tasks)
    },
  }

  const state: AuthenticationState = {
    creds,
    keys: makeCacheableSignalKeyStore(keys, logger),
  }

  const saveCreds: () => Promise<void> = async () => {
    logger.debug('save creds %s', phone)
    return await writeData('', creds)
  }

  return {
    state,
    saveCreds,
  }
}
