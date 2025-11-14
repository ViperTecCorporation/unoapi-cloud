import { createClient } from '@redis/client'
import { REDIS_URL, DATA_TTL, SESSION_TTL, DATA_URL_TTL, JIDMAP_TTL_SECONDS, SIGNAL_PURGE_DEVICE_LIST_ENABLED, SIGNAL_PURGE_SESSION_ENABLED, SIGNAL_PURGE_SENDER_KEY_ENABLED, JIDMAP_ENRICH_PER_SWEEP, WATCHDOG_PURGE_SCAN_COUNT } from '../defaults'
import logger from './logger'
import { GroupMetadata, proto } from '@whiskeysockets/baileys'
import { Webhook, configs } from './config' 

export const BASE_KEY = 'unoapi-'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any

export const startRedis = async (redisUrl = REDIS_URL, retried = false) => {
  if (!client) {
    logger.info(`Starting redis....`)
    client = await redisConnect(redisUrl)
    client.on('error', async (error: string) => {
      logger.error(`Redis error: ${error}`)
      client = undefined
      if (!retried) {
        logger.info(`Redis retry connect`)
        try {
          await startRedis(redisUrl, true)
        } catch (error) {
          logger.error(`Redis error on retry connect: ${error}`)
        }
      }
    })
    logger.info(`Started redis!`)
  }
  return client
}

export const getRedis = async (redisUrl = REDIS_URL) => {
  return await startRedis(redisUrl)
}

export const redisConnect = async (redisUrl = REDIS_URL) => {
  logger.info(`Connecting redis at ${redisUrl}....`)
  const redisClient = await createClient({ url: redisUrl })
  await redisClient.connect()
  logger.info(`Connected redis!`)
  return redisClient
}

export const redisGet = async (key: string) => {
  logger.trace(`Getting ${key}`)
  try {
    return client.get(key)
  } catch (error) {
    if (!client) {
      await getRedis()
      return client.get(key)
    } else {
      throw error
    }
  }
}

export const redisTtl = async (key: string) => {
  logger.trace(`Ttl ${key}`)
  try {
    return client.ttl(key)
  } catch (error) {
    if (!client) {
      await getRedis()
      return client.ttl(key)
    } else {
      throw error
    }
  }
}

const redisDel = async (key: string) => {
  logger.trace(`Deleting ${key}`)
  try {
    return client.del(key)
  } catch (error) {
    if (!client) {
      await getRedis()
      return client.del(key)
    } else {
      throw error
    }
  }
}

export const redisKeys = async (pattern: string) => {
  logger.trace(`Keys ${pattern}`)
  try {
    return client.keys(pattern)
  } catch (error) {
    if (!client) {
      await getRedis()
      return client.keys(pattern)
    } else {
      throw error
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redisSet = async function (key: string, value: any) {
  logger.trace(`Setting ${key} => ${(value + '').substring(0, 10)}...`)
  try {
    return client.set(key, value)
  } catch (error) {
    if (!client) {
      await getRedis()
      return client.set(key, value)
    } else {
      throw error
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redisSetAndExpire = async function (key: string, value: any, ttl: number) {
  logger.trace(`Setting ttl: ${ttl} ${key} -> ${(value + '').substring(0, 10)}...`)
  if (ttl < 0) {
    return redisSet(key, value)
  }
  try {
    return client.set(key, value, { EX: ttl })
  } catch (error) {
    if (!client) {
      await getRedis()
      return client.set(key, value, { EX: ttl })
    } else {
      throw error
    }
  }
}

// Helper: SCAN keys with pattern, returning up to `limit` keys (non-blocking vs KEYS)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const redisScanSome = async (pattern: string, limit: number): Promise<string[]> => {
  try {
    const c: any = await getRedis()
    let cursor = '0'
    const out: string[] = []
    const count = Math.max(10, limit || 100)
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await c.scan(cursor, { MATCH: pattern, COUNT: count })
      cursor = (typeof res.cursor !== 'undefined') ? `${res.cursor}` : `${res[0]}`
      const keys: string[] = Array.isArray(res.keys) ? res.keys : (res[1] || [])
      for (const k of keys || []) {
        out.push(k)
        if (out.length >= limit) return out
      }
    } while (cursor !== '0')
    return out
  } catch {
    try { const keys = await redisKeys(pattern); return (keys || []).slice(0, limit) } catch { return [] }
  }
}

// Atomic increment with TTL. Sets TTL on first increment (value === 1)
export const redisIncrWithTtl = async (key: string, ttlSec: number): Promise<number> => {
  logger.trace(`INCR ${key} with ttl ${ttlSec}s`)
  try {
    const v = await client.incr(key)
    if (v === 1 && ttlSec > 0) {
      try { await client.expire(key, ttlSec) } catch {}
    }
    return v
  } catch (error) {
    if (!client) {
      await getRedis()
      const v = await client.incr(key)
      if (v === 1 && ttlSec > 0) {
        try { await client.expire(key, ttlSec) } catch {}
      }
      return v
    }
    throw error
  }
}

export const authKey = (phone: string) => {
  return `${BASE_KEY}auth:${phone}`
}

const connectCountKey = (phone: string, ordinal: number | string) => {
  return `${BASE_KEY}connect-count:${phone}:${ordinal}`
}

export const lastTimerKey = (from: string, to: string) => {
  return `${BASE_KEY}timer:${from}:${to}`
}

export const sessionStatusKey = (phone: string) => {
  return `${BASE_KEY}status:${phone}`
}

const messageStatusKey = (phone: string, id: string) => {
  return `${BASE_KEY}message-status:${phone}:${id}`
}

const mediaKey = (phone: string, id: string) => {
  return `${BASE_KEY}media:${phone}:${id}`
}

const bulkMessageKeyBase = (phone: string, bulkId: string) => {
  return `${BASE_KEY}bulk-message:${phone}:${bulkId}`
}

const bulkMessageKey = (phone: string, bulkId: string, messageId: string, phoneNumber: string) => {
  return `${bulkMessageKeyBase(phone, bulkId)}:${messageId}:${phoneNumber}`
}

const messageKey = (phone: string, jid: string, id: string) => {
  return `${BASE_KEY}message:${phone}:${jid}:${id}`
}

// Última mensagem recebida (não-fromMe) por chat
const lastIncomingKeyKey = (phone: string, jid: string) => {
  return `${BASE_KEY}last-incoming:${phone}:${jid}`
}

// Contact names cache key
const contactNameKey = (phone: string, jid: string) => {
  return `${BASE_KEY}contact-name:${phone}:${jid}`
}
const contactInfoKey = (phone: string, jid: string) => {
  return `${BASE_KEY}contact-info:${phone}:${jid}`
}

export const configKey = (phone: string) => {
  return `${BASE_KEY}config:${phone}`
}

export const templateKey = (phone: string) => {
  return `${BASE_KEY}template:${phone}`
}

export const idKey = (phone: string, id: string) => {
  return `${BASE_KEY}key:${phone}:${id}`
}

export const unoIdKey = (phone: string, id: string) => {
  return `${BASE_KEY}id:${phone}:${id}`
}

export const jidKey = (phone: string, jid: string) => {
  return `${BASE_KEY}jid:${phone}:${jid}`
}

export const profilePictureKey = (phone: string, jid: string) => {
  return `${BASE_KEY}profile-picture:${phone}:${jid}`
}

export const groupKey = (phone: string, jid: string) => {
  return `${BASE_KEY}group:${phone}:${jid}`
}

// JID mapping PN <-> LID keys
// New, clearer schema (human-friendly) — session scope e global scope:
//  Session scope:
//   - jidmap:<session>:pn_for_lid:<lidJid> => value = pnJid (@s.whatsapp.net)
//   - jidmap:<session>:lid_for_pn:<pnJid>  => value = lidJid (@lid)
//  Global scope (compartilhado entre sessões):
//   - jidmap:global:pn_for_lid:<lidJid> => value = pnJid
//   - jidmap:global:lid_for_pn:<pnJid>  => value = lidJid
// Backward-compat com chaves antigas por sessão:
//   - jidmap:<session>:pn:<lidJid>  => value = pnJid
//   - jidmap:<session>:lid:<pnJid>  => value = lidJid
const jidMapPnKeyNew   = (session: string, lidJid: string) => `${BASE_KEY}jidmap:${session}:pn_for_lid:${lidJid}`
const jidMapLidKeyNew  = (session: string, pnJid: string) => `${BASE_KEY}jidmap:${session}:lid_for_pn:${pnJid}`
const jidMapPnKeyOld   = (session: string, lidJid: string) => `${BASE_KEY}jidmap:${session}:pn:${lidJid}`
const jidMapLidKeyOld  = (session: string, pnJid: string) => `${BASE_KEY}jidmap:${session}:lid:${pnJid}`
const jidMapPnKeyGlob  = (lidJid: string) => `${BASE_KEY}jidmap:global:pn_for_lid:${lidJid}`
const jidMapLidKeyGlob = (pnJid: string)  => `${BASE_KEY}jidmap:global:lid_for_pn:${pnJid}`

export const getPnForLid = async (session: string, lidJid: string) => {
  // Try new key first, then fallback to old
  const vNew = await redisGet(jidMapPnKeyNew(session, lidJid))
  if (vNew) return vNew
  const vOld = await redisGet(jidMapPnKeyOld(session, lidJid))
  if (vOld) return vOld
  // Fallback: global scope
  return redisGet(jidMapPnKeyGlob(lidJid))
}
export const getLidForPn = async (session: string, pnJid: string) => {
  // Try new key first, then fallback to old
  const vNew = await redisGet(jidMapLidKeyNew(session, pnJid))
  if (vNew) return vNew
  const vOld = await redisGet(jidMapLidKeyOld(session, pnJid))
  if (vOld) return vOld
  // Fallback: global scope
  return redisGet(jidMapLidKeyGlob(pnJid))
}
export const setJidMapping = async (session: string, pnJid: string, lidJid: string) => {
  if (!pnJid || !lidJid) return
  // Sanity check: ensure correct roles (pnJid is @s.whatsapp.net, lidJid is @lid)
  try {
    const pnIsPn = typeof pnJid === 'string' && pnJid.endsWith('@s.whatsapp.net')
    const lidIsLid = typeof lidJid === 'string' && lidJid.endsWith('@lid')
    const pnIsLid = typeof pnJid === 'string' && pnJid.endsWith('@lid')
    const lidIsPn = typeof lidJid === 'string' && lidJid.endsWith('@s.whatsapp.net')
    if (!pnIsPn || !lidIsLid) {
      if (pnIsLid && lidIsPn) {
        const tmp = pnJid; pnJid = lidJid; lidJid = tmp
      } else {
        return
      }
    }
  } catch { return }
  try {
    // Write both new and old schemas for compatibility
    await redisSetAndExpire(jidMapPnKeyNew(session, lidJid), pnJid, JIDMAP_TTL_SECONDS)
  } catch {}
  try {
    await redisSetAndExpire(jidMapLidKeyNew(session, pnJid), lidJid, JIDMAP_TTL_SECONDS)
  } catch {}
  try {
    await redisSetAndExpire(jidMapPnKeyOld(session, lidJid), pnJid, JIDMAP_TTL_SECONDS)
  } catch {}
  try {
    await redisSetAndExpire(jidMapLidKeyOld(session, pnJid), lidJid, JIDMAP_TTL_SECONDS)
  } catch {}
  // Also persist to global scope to compartilhar entre sessões
  try { await redisSetAndExpire(jidMapPnKeyGlob(lidJid), pnJid, JIDMAP_TTL_SECONDS) } catch {}
  try { await redisSetAndExpire(jidMapLidKeyGlob(pnJid), lidJid, JIDMAP_TTL_SECONDS) } catch {}
}

// Remove selective Signal sessions for a session phone & target JIDs (PN/LID variants)
// This forces Baileys to fetch sessions again on next assert.
export const delSignalSessionsForJids = async (session: string, jids: string[]) => {
  try {
    const base = `${BASE_KEY}auth:${session}:`
    let totalDeleted = 0
    for (const raw of (jids || [])) {
      const v = `${raw || ''}`
      if (!v) continue
      // Build variants: full JID, base without domain/suffix, and digits-only PN when available
      const variants = new Set<string>()
      variants.add(v)
      try {
        const baseId = v.split('@')[0] // remove domain
        if (baseId) variants.add(baseId)
        const noDevice = baseId.split(':')[0] // remove :device
        if (noDevice) variants.add(noDevice)
      } catch {}
      try {
        // digits PN variant (if possible)
        const digits = v.replace(/\D/g, '')
        if (digits) variants.add(digits)
      } catch {}
      // Known Signal state key families to purge for target address (try with all variants)
      const patterns: string[] = []
      for (const id of Array.from(variants)) {
        if (SIGNAL_PURGE_SESSION_ENABLED) patterns.push(`${base}session-${id}*`)
        if (SIGNAL_PURGE_SENDER_KEY_ENABLED) patterns.push(`${base}sender-key-${id}*`)
        if (SIGNAL_PURGE_DEVICE_LIST_ENABLED) patterns.push(`${base}device-list-${id}*`)
      }
      for (const p of patterns) {
        try {
          const keys = await redisScanSome(p, Math.max(50, WATCHDOG_PURGE_SCAN_COUNT || 200))
          let deleted = 0
          for (const k of keys || []) {
            try { await redisDel(k); deleted += 1 } catch {}
          }
          if (deleted > 0) {
            totalDeleted += deleted
            try { logger.debug('DELIVERY_WATCH purge: %s deleted for pattern %s', deleted, p) } catch {}
          } else {
            try { logger.debug('DELIVERY_WATCH purge: no keys for pattern %s', p) } catch {}
          }
        } catch {}
      }
    }
    try { logger.info('DELIVERY_WATCH purge: total deleted=%s for %s target(s)', totalDeleted, (jids || []).length) } catch {}
  } catch (e) {
    try { logger.warn(e as any, 'Ignore error during session purge for %s', session) } catch {}
  }
}

// Light probe to count Signal session keys for target JIDs (debug/observability)
export const countSignalSessionsForJids = async (session: string, jids: string[]) => {
  try {
    const base = `${BASE_KEY}auth:${session}:`
    let total = 0
    for (const raw of (jids || [])) {
      const v = `${raw || ''}`
      if (!v) continue
      const variants = new Set<string>()
      variants.add(v)
      try {
        const baseId = v.split('@')[0]
        if (baseId) variants.add(baseId)
        const noDevice = baseId.split(':')[0]
        if (noDevice) variants.add(noDevice)
      } catch {}
      try {
        const digits = v.replace(/\D/g, '')
        if (digits) variants.add(digits)
      } catch {}
      for (const id of Array.from(variants)) {
        const patterns = [
          `${base}session-${id}*`,
          `${base}sender-key-${id}*`,
          `${base}device-list-${id}*`,
        ]
        for (const p of patterns) {
          try {
            const keys = await redisScanSome(p, Math.max(50, WATCHDOG_PURGE_SCAN_COUNT || 200))
            const count = (keys || []).length
            total += count
            try { logger.debug('ASSERT probe: %s keys (sample) for pattern %s', count, p) } catch {}
          } catch {}
        }
      }
    }
    try { logger.info('ASSERT probe: total keys=%s for %s target(s)', total, (jids || []).length) } catch {}
  } catch (e) {
    try { logger.warn(e as any, 'Ignore error during assert probe for %s', session) } catch {}
  }
}

export const blacklist = (from: string, webhookId: string, to: string) => {
  return `${BASE_KEY}blacklist:${from}:${webhookId}:${to}`
}

export const getJid = async (phone: string, jid: any) => {
  const key = jidKey(phone, jid)
  return redisGet(key)
}

export const setJid = async (phone: string, jid: string, validJid: string) => {
  const key = jidKey(phone, jid)
  await client.set(key, validJid)
}

export const setBlacklist = async (from: string, webhookId: string, to: string, ttl: number) => {
  const key = blacklist(from, webhookId, to)
  if (ttl > 0) {
    return client.set(key, '1', { EX: ttl })
  } else if (ttl == 0) {
    return client.del(key)
  } else {
    return client.set(key, '1')
  }
}

export const getSessionStatus = async (phone: string) => {
  const key = sessionStatusKey(phone)
  return redisGet(key)
}

export const setSessionStatus = async (phone: string, status: string) => {
  const key = sessionStatusKey(phone)
  await client.set(key, status)
}

export const getMessageStatus = async (phone: string, id: string) => {
  const key = messageStatusKey(phone, id)
  return redisGet(key)
}

export const setMessageStatus = async (phone: string, id: string, status: string) => {
  const key = messageStatusKey(phone, id)
  await client.set(key, status, { EX: DATA_TTL })
}

export const getTemplates = async (phone: string) => {
  const key = templateKey(phone)
  const configString = await redisGet(key)
  if (configString) {
    const config = JSON.parse(configString)
    return config
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setTemplates = async (phone: string, value: any) => {
  const { id } = value
  if (!id) {
    throw new Error(`New template has no ID or an invalid format`);
  }
  const current = (await getTemplates(phone)) || {}
  const key = templateKey(phone)
  var config = value
  if (Object.keys(current).length !== 0) {
    if ('id' in current) {
      if (current.id !== id) {
        config = []
        config.push(current)
        config.push(value)
      }
    } else {
      config = []
      current.forEach(element => {
        if (element.id !== id) {
          config.push(element)
        }
      });
      config.push(value)
    }
  }
  await redisSetAndExpire(key, JSON.stringify(config), SESSION_TTL)
  return config
}

export const getConfig = async (phone: string) => {
  const key = configKey(phone)
  const configString = await redisGet(key)
  if (configString) {
    const config = JSON.parse(configString)
    return config
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setConfig = async (phone: string, value: any) => {
  const currentConfig = await getConfig(phone)
  const key = configKey(phone)
  const currentWebhooks: Webhook[] = currentConfig && currentConfig.webhooks || []
  const newWebhooks: Webhook[] = value && value.webhooks || []
  const updatedWebooks: Webhook[] = []
  const baseWebhook = value.overrideWebhooks || currentWebhooks.length == 0 ? newWebhooks : currentWebhooks
  const searchWebhooks = value.overrideWebhooks ? currentWebhooks : newWebhooks
  baseWebhook.forEach(n => {
    const c = searchWebhooks.find((c) => c.id === n.id)
    if (c) {
      updatedWebooks.push({ ...c, ...n })
    } else {
      updatedWebooks.push(n)
    }
  })
  value.webhooks = updatedWebooks
  const config = { ...currentConfig, ...value }
  // Enforce per-session storage flags to avoid false overrides via templates/UI
  // Since this setter persists to Redis, sessions using Redis must have useRedis/useS3 true
  try { (config as any).useRedis = true } catch {}
  try { (config as any).useS3 = true } catch {}
  delete config.overrideWebhooks
  await redisSetAndExpire(key, JSON.stringify(config), SESSION_TTL)
  configs.delete(phone)
  return config
}

export const delConfig = async (phone: string) => {
  const key = configKey(phone)
  await redisDel(key)
}

export const delAuth = async (phone: string) => {
  const key = authKey(phone)
  logger.trace(`Deleting key ${key}...`)
  await redisDel(key)
  logger.debug(`Deleted key ${key}!`)
  const pattern = authKey(`${phone}:*`)
  const keys = await redisKeys(pattern)
  logger.debug(`${keys.length} keys to delete auth for ${phone}`)
  for (let i = 0, j = keys.length; i < j; i++) {
    const key = keys[i]
    logger.trace(`Deleting key ${key}...`)
    await redisDel(key)
    logger.trace(`Deleted key ${key}!`)
  }
}

export const getAuth = async (phone: string, parse = (value: string) => JSON.parse(value)) => {
  const key = authKey(phone)
  const authString = await redisGet(key)
  if (authString) {
    const authJson = parse(authString)
    return authJson
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setAuth = async (phone: string, value: any, stringify = (value: string) => JSON.stringify(value, null, '\t')) => {
  const key = authKey(phone)
  const authValue = stringify(value)
  return redisSetAndExpire(key, authValue, SESSION_TTL)
}

export const setbulkMessage = async (phone: string, bulkId: string, messageId: string, phoneNumber) => {
  const key = bulkMessageKey(phone, bulkId, messageId, phoneNumber)
  return redisSetAndExpire(key, 'scheduled', DATA_TTL)
}

export const getBulkReport = async (phone: string, id: string) => {
  const pattern = `${bulkMessageKeyBase(phone, id)}:*`
  const keys: string[] = await redisKeys(pattern)
  logger.debug(`keys: ${JSON.stringify(keys)}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report: any = await keys.reduce(async (accP: Promise<any>, key: string) => {
    const data = key.split(':')
    const messageId = data[3]
    const phoneNumber = data[4]
    const statusKey = messageStatusKey(phone, messageId)
    const acc = await accP
    acc[phoneNumber] = await redisGet(statusKey)
    return acc
  }, Promise.resolve({}))

  logger.debug(`Report: ${JSON.stringify(report)}`)

  const numbers = Object.keys(report)
  logger.debug(`numbers: ${JSON.stringify(numbers)}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = numbers.reduce((acc: any, number: string) => {
    const s = report[number]
    if (!acc[s]) {
      acc[s] = 0
    }
    acc[s] = acc[s] + 1
    return acc
  }, {})
  logger.debug(`status: ${JSON.stringify(status)}`)

  return { report, status }
}

export const getMessage = async <T>(phone: string, jid: string, id: string): Promise<T | undefined> => {
  const key = messageKey(phone, jid, id)
  const stored = await redisGet(key)
  if (!stored) return undefined
  // Detect JSON vs base64-encoded protobuf
  if (stored.trim().startsWith('{') || stored.trim().startsWith('[')) {
    try { return JSON.parse(stored) as T } catch { return undefined }
  }
  try {
    const bytes = Buffer.from(stored, 'base64')
    const msg = proto.WebMessageInfo.decode(bytes)
    // Return protobuf message instance (compatible at runtime with WAMessage usage)
    return msg as unknown as T
  } catch {
    // last resort: ignore corrupt entry
    return undefined
  }
}

// Persistência de última mensagem recebida por chat
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getLastIncomingKey = async (phone: string, jid: string): Promise<any | undefined> => {
  const key = lastIncomingKeyKey(phone, jid)
  const stored = await redisGet(key)
  if (!stored) return undefined
  try { return JSON.parse(stored) } catch { return undefined }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setLastIncomingKey = async (phone: string, jid: string, value: any) => {
  const key = lastIncomingKeyKey(phone, jid)
  return redisSetAndExpire(key, JSON.stringify(value), DATA_TTL)
}

export const getContactName = async (phone: string, jid: string) => {
  const key = contactNameKey(phone, jid)
  return redisGet(key)
}
export const setContactName = async (phone: string, jid: string, name: string) => {
  const key = contactNameKey(phone, jid)
  return redisSetAndExpire(key, name, SESSION_TTL)
}
export const getContactInfo = async (phone: string, jid: string) => {
  const key = contactInfoKey(phone, jid)
  return redisGet(key)
}
export const setContactInfo = async (phone: string, jid: string, info: any) => {
  const key = contactInfoKey(phone, jid)
  return redisSetAndExpire(key, JSON.stringify(info || {}), SESSION_TTL)
}

// Varre contact-info da sessão e enriquece o JIDMAP PN<->LID
export const enrichJidMapFromContactInfo = async (session: string, limit = 2000) => {
  try {
    const base = `${BASE_KEY}contact-info:${session}:`
    const pattern = `${BASE_KEY}contact-info:${session}:*`
    const cursorKey = `${BASE_KEY}jidmap:cursor:${session}:contact-info`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = await getRedis()
    let cursor: string = (await redisGet(cursorKey)) || '0'
    let updated = 0
    let scanned = 0
    while (scanned < limit) {
      let res: any
      try { res = await c.scan(cursor, { MATCH: pattern, COUNT: Math.max(50, limit) }) } catch { break }
      if (!res) break
      cursor = (typeof res.cursor !== 'undefined') ? `${res.cursor}` : `${res[0]}`
      const keys: string[] = Array.isArray(res.keys) ? res.keys : (res[1] || [])
      if (!Array.isArray(keys) || keys.length === 0) {
        if (cursor === '0') break
        continue
      }
      for (const k of keys) {
        if (scanned >= limit) break
        scanned += 1
        try {
          const jid = k.substring(base.length)
          const raw = await redisGet(k)
          if (!raw) continue
          const info = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!info) continue
          // LID -> PN
          if (typeof jid === 'string' && jid.endsWith('@lid')) {
            let pnJid: string | undefined = info?.pnJid
            if (!pnJid && info?.pn) {
              const digits = `${info.pn}`.replace(/\D/g, '')
              if (digits) pnJid = `${digits}@s.whatsapp.net`
            }
            if (pnJid && pnJid.endsWith('@s.whatsapp.net')) {
              try { await setJidMapping(session, pnJid, jid); updated += 1 } catch {}
            }
          }
          // PN -> LID
          if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
            const lidJid: string | undefined = info?.lidJid
            if (lidJid && lidJid.endsWith('@lid')) {
              try { await setJidMapping(session, jid, lidJid); updated += 1 } catch {}
            }
          }
        } catch {}
      }
      if (cursor === '0') break
    }
    try { await redisSetAndExpire(cursorKey, cursor, 3600) } catch {}
    try { logger.info('JIDMAP enrich: scanned=%s updated=%s (limit=%s) for session=%s', scanned, updated, limit, session) } catch {}
  } catch (e) {
    try { logger.warn(e as any, 'JIDMAP enrich failed for session=%s', session) } catch {}
  }
}

// Fast-path lookups into Baileys internal auth lid-mapping cache (per-session)
// Attempts to resolve PN JID from LID JID without a full sweep
export const getPnForLidFromAuthCache = async (session: string, lidJid: string): Promise<string | undefined> => {
  try {
    const digits = `${lidJid || ''}`.split('@')[0].split(':')[0].replace(/\D/g, '')
    if (!digits) return undefined
    const key = `${BASE_KEY}auth:${session}:lid-mapping-${digits}_reverse`
    const raw = await redisGet(key)
    if (!raw) return undefined
    const val = `${raw}`
    if (val.endsWith('@s.whatsapp.net')) return val
    const pnDigits = val.replace(/\D/g, '')
    return pnDigits ? `${pnDigits}@s.whatsapp.net` : undefined
  } catch { return undefined }
}

export const getLidForPnFromAuthCache = async (session: string, pnJid: string): Promise<string | undefined> => {
  try {
    const digits = `${pnJid || ''}`.split('@')[0].split(':')[0].replace(/\D/g, '')
    if (!digits) return undefined
    const key = `${BASE_KEY}auth:${session}:lid-mapping-${digits}`
    const raw = await redisGet(key)
    if (!raw) return undefined
    const val = `${raw}`
    if (val.endsWith('@lid')) return val
    const lidDigits = val.replace(/\D/g, '')
    return lidDigits ? `${lidDigits}@lid` : undefined
  } catch { return undefined }
}

export const getConnectCount = async(phone: string) => {
  const keyPattern = connectCountKey(phone, '*')
  const keys = await redisKeys(keyPattern)
  return keys.length || 0
}

export const clearConnectCount = async(phone: string) => {
  const keyPattern = connectCountKey(phone, '*')
  const keys = await redisKeys(keyPattern)
  for (let index = 0; index < keys.length.length; index++) {
    const key = keys[index];
    await redisDel(key)
  }
}

export const setConnectCount = async (phone: string, count: number, ttl: number) => {
  const key = connectCountKey(phone, count)
  await redisSetAndExpire(key, 1, ttl)
}

// One-time bootstrap: migrate all per-session JIDMAP pairs into the global JIDMAP namespace
export const bootstrapJidMapGlobalOnce = async (): Promise<void> => {
  try {
    const marker = `${BASE_KEY}jidmap:global:bootstrapped`
    const already = await redisGet(marker)
    if (already) return
    let total = 0
    // Collect all per-session pn_for_lid / lid_for_pn (new + old schema)
    const patterns = [
      `${BASE_KEY}jidmap:*:pn_for_lid:*`,
      `${BASE_KEY}jidmap:*:lid_for_pn:*`,
      `${BASE_KEY}jidmap:*:pn:*`,
      `${BASE_KEY}jidmap:*:lid:*`,
    ]
    for (const p of patterns) {
      try {
        const keys = await redisKeys(p)
        for (const k of keys || []) {
          try {
            const v = await redisGet(k)
            if (!v) continue
            // Determine kind and extract ids
            if (k.includes(':pn_for_lid:')) {
              const lid = k.substring(k.indexOf(':pn_for_lid:') + 12)
              await redisSetAndExpire(jidMapPnKeyGlob(lid), v, JIDMAP_TTL_SECONDS)
              total += 1
            } else if (k.includes(':lid_for_pn:')) {
              const pn = k.substring(k.indexOf(':lid_for_pn:') + 12)
              await redisSetAndExpire(jidMapLidKeyGlob(pn), v, JIDMAP_TTL_SECONDS)
              total += 1
            } else if (k.includes(':pn:')) {
              const lid = k.substring(k.indexOf(':pn:') + 4)
              await redisSetAndExpire(jidMapPnKeyGlob(lid), v, JIDMAP_TTL_SECONDS)
              total += 1
            } else if (k.includes(':lid:')) {
              const pn = k.substring(k.indexOf(':lid:') + 5)
              await redisSetAndExpire(jidMapLidKeyGlob(pn), v, JIDMAP_TTL_SECONDS)
              total += 1
            }
          } catch {}
        }
      } catch {}
    }
    try { logger.info('JIDMAP bootstrap: migrated %s mappings to global', total) } catch {}
    await redisSetAndExpire(marker, '1', 365 * 24 * 60 * 60) // mark for ~1y
  } catch (e) {
    try { logger.warn(e as any, 'JIDMAP bootstrap failed') } catch {}
  }
}

// Mirror Baileys internal per-session lid-mapping cache into our JIDMAP
export const enrichJidMapFromAuthLidCache = async (session: string): Promise<void> => {
  try {
    const base = `${BASE_KEY}auth:${session}:`
    const pattern = `${base}lid-mapping-*`
    const cursorKey = `${BASE_KEY}jidmap:cursor:${session}:auth-lid-cache`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = await getRedis()
    let cursor: string = (await redisGet(cursorKey)) || '0'
    let updated = 0
    let scanned = 0
    const limit = Math.max(50, JIDMAP_ENRICH_PER_SWEEP || 200)
    // Varre um pedaço por execução para reduzir custo (SCAN + COUNT)
    let res: any
    try { res = await c.scan(cursor, { MATCH: pattern, COUNT: limit }) } catch { res = undefined }
    if (res) {
      cursor = (typeof res.cursor !== 'undefined') ? `${res.cursor}` : `${res[0]}`
      const keys: string[] = Array.isArray(res.keys) ? res.keys : (res[1] || [])
      for (const k of keys || []) {
        if (scanned >= limit) break
        scanned += 1
        try {
          const v = await redisGet(k)
          if (!v) continue
          const sufIdx = k.indexOf('lid-mapping-')
          if (sufIdx < 0) continue
          const suffix = k.substring(sufIdx + 'lid-mapping-'.length)
          const rawVal = `${v}`
          const isReverse = suffix.endsWith('_reverse')
          if (isReverse) {
            const lidDigits = suffix.replace('_reverse', '').replace(/\D/g, '')
            const lidJid = lidDigits ? `${lidDigits}@lid` : undefined
            let pnJid: string | undefined
            if (rawVal.endsWith('@s.whatsapp.net')) pnJid = rawVal
            else {
              const pnDigits = rawVal.replace(/\D/g, '')
              if (pnDigits) pnJid = `${pnDigits}@s.whatsapp.net`
            }
            if (pnJid && lidJid) {
              try { await setJidMapping(session, pnJid, lidJid); updated += 1 } catch {}
            }
          } else {
            const pnDigits = suffix.replace(/\D/g, '')
            const pnJid = pnDigits ? `${pnDigits}@s.whatsapp.net` : undefined
            const lidJid = rawVal
            if (pnJid && typeof lidJid === 'string' && lidJid.endsWith('@lid')) {
              try { await setJidMapping(session, pnJid, lidJid); updated += 1 } catch {}
            }
          }
        } catch {}
      }
    }
    try { await redisSetAndExpire(cursorKey, cursor, 3600) } catch {}
    try { logger.info('JIDMAP enrich(auth): session=%s scanned=%s updated=%s', session, scanned, updated) } catch {}
  } catch (e) { try { logger.warn(e as any, 'JIDMAP enrich(auth) failed for session=%s', session) } catch {} }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setMessage = async (phone: string, jid: string, id: string, value: any) => {
  const key = messageKey(phone, jid, id)
  // Prefer compact, robust protobuf encoding to avoid JSON Long/toObject pitfalls
  try {
    const bytes = proto.WebMessageInfo.encode(value as any).finish()
    const b64 = Buffer.from(bytes).toString('base64')
    return redisSetAndExpire(key, b64, DATA_TTL)
  } catch (e) {
    // Fallback: store a minimal JSON summary to avoid crashing
    try {
      const mt = (() => { try { return Object.keys(value?.message || {})[0] } catch { return undefined } })()
      const lite: any = {
        key: {
          id: value?.key?.id,
          remoteJid: value?.key?.remoteJid,
          fromMe: value?.key?.fromMe,
          participant: value?.key?.participant,
        },
        messageTimestamp: value?.messageTimestamp,
      }
      if (mt) lite.message = { [mt]: {} }
      return redisSetAndExpire(key, JSON.stringify(lite), DATA_TTL)
    } catch {
      return redisSetAndExpire(key, '{}', DATA_TTL)
    }
  }
}

export const getProfilePicture = async (phone: string, jid: string) => {
  const key = profilePictureKey(phone, jid)
  return redisGet(key)
}

export const setProfilePicture = async (phone: string, jid: string, url: string) => {
  const key = profilePictureKey(phone, jid)
  return redisSetAndExpire(key, url, DATA_URL_TTL)
}

export const getGroup = async (phone: string, jid: string) => {
  const key = groupKey(phone, jid)
  const group = await redisGet(key)
  if (group) {
    return JSON.parse(group) as GroupMetadata
  }
}

export const setGroup = async (phone: string, jid: string, data: GroupMetadata) => {
  const key = groupKey(phone, jid)
  return redisSetAndExpire(key, JSON.stringify(data), DATA_TTL)
}

export const setLastTimer = async (phone: string, to: string, current: Date) => {
  const key = lastTimerKey(phone, to)
  logger.debug('setLastTimer with key %s', key)
  return redisSet(key, current.toISOString())
}

export const getLastTimer = async (phone: string, to: string) => {
  const key = lastTimerKey(phone, to)
  logger.debug('getLastTimer with key %s', key)
  return redisGet(key)
}

export const delLastTimer = async (phone: string, to: string) => {
  const key = lastTimerKey(phone, to)
  logger.debug('delLastTimer with key %s', key)
  return redisDel(key)
}

export const setMedia = async (phone: string, id: string, payload: any) => {
  const key = mediaKey(phone, id)
  logger.debug('setMedia with key %s', key)
  return redisSetAndExpire(key, JSON.stringify(payload), DATA_TTL)
}

export const getMedia = async (phone: string, id: string) => {
  const key = mediaKey(phone, id)
  logger.debug('getMedia with key %s', key)
  const payload = await redisGet(key)
  return payload ? JSON.parse(payload) : undefined
}

export const getUnoId = async (phone: string, idBaileys: string) => {
  const key = unoIdKey(phone, idBaileys)
  return redisGet(key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setUnoId = async (phone: string, idBaileys: string, idUno: string) => {
  const key = unoIdKey(phone, idBaileys)
  return redisSetAndExpire(key, idUno, DATA_TTL)
}

// Rate limit keys
export const rateGlobalKey = (session: string) => `${BASE_KEY}ratelimit:${session}:global`
export const rateToKey = (session: string, to: string) => `${BASE_KEY}ratelimit:${session}:to:${to}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getKey = async (phone: string, id: string): Promise<any | undefined> => {
  const key = idKey(phone, id)
  const string = await redisGet(key)
  if (string) {
    const json = JSON.parse(string)
    return json
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setKey = async (phone: string, id: string, value: any) => {
  const key = idKey(phone, id)
  const string = JSON.stringify(value)
  return redisSetAndExpire(key, string, DATA_TTL)
}
