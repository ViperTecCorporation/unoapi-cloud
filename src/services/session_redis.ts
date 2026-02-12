import { BufferJSON } from '@whiskeysockets/baileys'
import { setAuth, getAuth, delAuth, getAuthRawMany } from './redis'
import { session, writeData, readData, readManyData, removeData, getKey } from './session'
import logger from './logger'

export const sessionRedis: session = async (phone: string) => {
  const getKey: getKey = (type: string, id: string) => `:${type}-${id}`
  const getBase = (key: string) => `${phone}${key ? key : ':creds'}`

  const writeData: writeData = async (key: string, data: object) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await setAuth(
        getBase(key),
        data,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (value: any) => JSON.stringify(value, BufferJSON.replacer)
      )
    } catch (error) {
      logger.error(error, 'Error on write auth')
      throw error
    }
  }

  const readData: readData = async (key: string) => {
    try {
      return getAuth(getBase(key), (value: string) => {
        try {
          return value ? JSON.parse(value, BufferJSON.reviver) : null
        } catch (error) {
          logger.error(`Error on parsing auth: ${value}`)
          throw error
        }
      })
    } catch (error) {
      logger.error(error, 'Error on read auth')
      throw error
    }
  }

  const readManyData: readManyData = async (keys: string[]) => {
    try {
      if (!keys || keys.length === 0) return {}
      const baseKeys = keys.map((k) => getBase(k))
      const rawByKey = await getAuthRawMany(baseKeys)
      const out: Record<string, object | undefined> = {}
      for (let i = 0; i < keys.length; i += 1) {
        const baseKey = baseKeys[i]
        const raw = rawByKey[baseKey]
        if (!raw) {
          out[keys[i]] = undefined
          continue
        }
        try {
          out[keys[i]] = JSON.parse(raw, BufferJSON.reviver)
        } catch (error) {
          logger.error(`Error on parsing auth: ${raw}`)
          throw error
        }
      }
      return out
    } catch (error) {
      logger.error(error, 'Error on read auth batch')
      throw error
    }
  }

  const removeData: removeData = async (key: string) => {
    try {
      await delAuth(getBase(key))
    } catch (error) {
      logger.error(error, 'Error on remove auth %s')
      throw error
    }
  }

  return { writeData, getKey, removeData, readData, readManyData }
}
