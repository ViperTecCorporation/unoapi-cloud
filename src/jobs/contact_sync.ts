import { v4 as uuid } from 'uuid'
import {
  CONTACT_SYNC_ENABLED,
  CONTACT_SYNC_INTERVAL_MS,
  CONTACT_SYNC_SCAN_COUNT,
  CONTACT_SYNC_PENDING_POLL_MS,
  CONTACT_SYNC_PENDING_TTL_SEC,
} from '../defaults'
import logger from '../services/logger'
import { Outgoing } from '../services/outgoing'
import { BASE_KEY, delContactSyncPending, getRedis, redisGet, redisSetAndExpire, redisSetIfNotExists } from '../services/redis'
import { jidToPhoneNumber } from '../services/transformer'

type ContactSyncItem = {
  wa_id: string
  profile: {
    name: string
    phone: string
  }
}

const CONTACT_SYNC_MESSAGE_BODY = 'contacts.update'
const CONTACT_SYNC_LOCK_KEY = `${BASE_KEY}contact-sync:lock`
const CONTACT_SYNC_LOCK_PREFIX = `${BASE_KEY}contact-sync:lock:`
const CONTACT_SYNC_LOCK_BUFFER_SEC = 60
const CONTACT_SYNC_PAGE_SIZE = 100
const CONTACT_SYNC_PENDING_PREFIX = `${BASE_KEY}contact-sync:pending:`
const CONTACT_SYNC_SCHEDULE_PREFIX = `${BASE_KEY}contact-sync:schedule:`
const CONTACT_SYNC_SCHEDULE_MIN_SEC = 4 * 60 * 60
const CONTACT_SYNC_SCHEDULE_MAX_SEC = 12 * 60 * 60

const getScheduleTtlSec = () =>
  Math.floor(CONTACT_SYNC_SCHEDULE_MIN_SEC +
    (Math.random() * (CONTACT_SYNC_SCHEDULE_MAX_SEC - CONTACT_SYNC_SCHEDULE_MIN_SEC + 1)))

const scheduleKeyForPhone = (phone: string) => `${CONTACT_SYNC_SCHEDULE_PREFIX}${phone}`

const normalizeDigits = (value?: string) => `${value || ''}`.replace(/\D/g, '')

const buildContactSyncPayload = (phone: string, contacts: ContactSyncItem[]) => {
  const timestamp = `${Math.floor(Date.now() / 1000)}`
  const from = contacts.find((c) => c.wa_id !== phone)?.wa_id || contacts[0]?.wa_id || phone
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: phone,
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: phone,
                phone_number_id: phone,
              },
              contacts,
              messages: [
                {
                  from,
                  id: uuid(),
                  timestamp,
                  text: { body: CONTACT_SYNC_MESSAGE_BODY },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }
}

const parseContactInfoKey = (key: string) => {
  const prefix = `${BASE_KEY}contact-info:`
  if (!key.startsWith(prefix)) return undefined
  const rest = key.substring(prefix.length)
  const sep = rest.indexOf(':')
  if (sep < 0) return undefined
  const phone = rest.substring(0, sep)
  const jid = rest.substring(sep + 1)
  return { phone, jid }
}

const resolveContactFromInfo = (jid: string, info: any) => {
  if (jid === 'status@broadcast') return undefined
  if (jid.includes('@lid')) return undefined
  const name = `${info?.name || ''}`.trim()
  let pn = normalizeDigits(info?.pn)
  if (!pn) {
    const pnJid = `${info?.pnJid || ''}`
    if (pnJid.endsWith('@s.whatsapp.net')) {
      pn = normalizeDigits(jidToPhoneNumber(pnJid, ''))
    }
  }
  if (!pn) {
    if (jid.endsWith('@s.whatsapp.net')) {
      pn = normalizeDigits(jidToPhoneNumber(jid, ''))
    } else {
      pn = normalizeDigits(jid)
    }
  }
  if (!pn) return undefined
  return { pn, name }
}

export class ContactSyncJob {
  private outgoing: Outgoing

  constructor(outgoing: Outgoing) {
    this.outgoing = outgoing
  }

  private async sendContacts(phone: string, contacts: ContactSyncItem[]): Promise<void> {
    for (let i = 0; i < contacts.length; i += CONTACT_SYNC_PAGE_SIZE) {
      const page = contacts.slice(i, i + CONTACT_SYNC_PAGE_SIZE)
      if (!page.length) continue
      const payload = buildContactSyncPayload(phone, page)
      await this.outgoing.send(phone, payload)
      logger.info('CONTACT_SYNC sent: phone=%s contacts=%s', phone, page.length)
    }
  }

  private upsertContact(bucket: Map<string, ContactSyncItem>, jid: string, info: any) {
    const resolved = resolveContactFromInfo(jid, info)
    if (!resolved) return
    const existing = bucket.get(resolved.pn)
    if (!existing) {
      bucket.set(resolved.pn, {
        wa_id: resolved.pn,
        profile: {
          name: resolved.name,
          phone: resolved.pn,
        },
      })
    } else if (resolved.name && !existing.profile.name) {
      existing.profile.name = resolved.name
    }
  }

  private async loadContactsByPhone(): Promise<Map<string, Map<string, ContactSyncItem>>> {
    const redis: any = await getRedis()
    const perPhone = new Map<string, Map<string, ContactSyncItem>>()
    const pattern = `${BASE_KEY}contact-info:*`
    const count = Math.max(10, CONTACT_SYNC_SCAN_COUNT || 500)
    let cursor = '0'
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await redis.scan(cursor, { MATCH: pattern, COUNT: count })
      cursor = (typeof res.cursor !== 'undefined') ? `${res.cursor}` : `${res[0]}`
      const keys: string[] = Array.isArray(res.keys) ? res.keys : (res[1] || [])
      if (!keys.length) continue
      const values = await redis.mGet(keys)
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]
        const raw = values?.[i]
        if (!raw) continue
        const parsed = parseContactInfoKey(key)
        if (!parsed) continue
        const { phone, jid } = parsed
        if (!phone || !jid) continue
        let info: any
        try { info = JSON.parse(raw) } catch { continue }
        let bucket = perPhone.get(phone)
        if (!bucket) {
          bucket = new Map()
          perPhone.set(phone, bucket)
        }
        this.upsertContact(bucket, jid, info)
      }
    } while (cursor !== '0')
    return perPhone
  }

  private async loadContactsForPhone(phone: string): Promise<Map<string, ContactSyncItem>> {
    const redis: any = await getRedis()
    const bucket = new Map<string, ContactSyncItem>()
    const pattern = `${BASE_KEY}contact-info:${phone}:*`
    const count = Math.max(10, CONTACT_SYNC_SCAN_COUNT || 500)
    let cursor = '0'
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await redis.scan(cursor, { MATCH: pattern, COUNT: count })
      cursor = (typeof res.cursor !== 'undefined') ? `${res.cursor}` : `${res[0]}`
      const keys: string[] = Array.isArray(res.keys) ? res.keys : (res[1] || [])
      if (!keys.length) continue
      const values = await redis.mGet(keys)
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]
        const raw = values?.[i]
        if (!raw) continue
        const parsed = parseContactInfoKey(key)
        if (!parsed || parsed.phone !== phone) continue
        let info: any
        try { info = JSON.parse(raw) } catch { continue }
        this.upsertContact(bucket, parsed.jid, info)
      }
    } while (cursor !== '0')
    return bucket
  }

  public async runForPhone(phone: string): Promise<boolean> {
    if (!CONTACT_SYNC_ENABLED || CONTACT_SYNC_INTERVAL_MS <= 0) return false    
    if (!process.env.REDIS_URL) return false
    try {
      const scheduled = await redisGet(scheduleKeyForPhone(phone))
      if (scheduled) {
        logger.debug('CONTACT_SYNC skip: schedule active for %s', phone)
        return false
      }
    } catch {}
    const lockTtlSec = Math.max(60, CONTACT_SYNC_PENDING_TTL_SEC)
    const lockKey = `${CONTACT_SYNC_LOCK_PREFIX}${phone}`
    const acquired = await redisSetIfNotExists(lockKey, `${Date.now()}`, lockTtlSec)
    if (!acquired) {
      logger.debug('CONTACT_SYNC skip: lock is held for %s', phone)
      return false
    }
    const bucket = await this.loadContactsForPhone(phone)
    const contacts = Array.from(bucket.values())
    if (!contacts.length) return false
    await this.sendContacts(phone, contacts)
    try { await redisSetAndExpire(scheduleKeyForPhone(phone), `${Date.now()}`, getScheduleTtlSec()) } catch {}
    return true
  }

  public async run(): Promise<void> {
    if (!CONTACT_SYNC_ENABLED || CONTACT_SYNC_INTERVAL_MS <= 0) return
    if (!process.env.REDIS_URL) return
    const lockTtlSec = Math.max(60, Math.ceil(CONTACT_SYNC_INTERVAL_MS / 1000) - CONTACT_SYNC_LOCK_BUFFER_SEC)
    const acquired = await redisSetIfNotExists(CONTACT_SYNC_LOCK_KEY, `${Date.now()}`, lockTtlSec)
    if (!acquired) {
      logger.debug('CONTACT_SYNC skip: lock is held')
      return
    }
    const perPhone = await this.loadContactsByPhone()
    for (const [phone, items] of perPhone) {
      try {
        const scheduled = await redisGet(scheduleKeyForPhone(phone))
        if (scheduled) {
          logger.debug('CONTACT_SYNC skip: schedule active for %s', phone)
          continue
        }
      } catch {}
      const contacts = Array.from(items.values())
      if (!contacts.length) continue
      await this.sendContacts(phone, contacts)
      try { await redisSetAndExpire(scheduleKeyForPhone(phone), `${Date.now()}`, getScheduleTtlSec()) } catch {}
    }
  }

  public async runPending(): Promise<void> {
    if (!CONTACT_SYNC_ENABLED || CONTACT_SYNC_INTERVAL_MS <= 0) return
    if (!process.env.REDIS_URL) return
    const redis: any = await getRedis()
    const pattern = `${CONTACT_SYNC_PENDING_PREFIX}*`
    const count = Math.max(10, CONTACT_SYNC_SCAN_COUNT || 500)
    let cursor = '0'
    const phones = new Set<string>()
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await redis.scan(cursor, { MATCH: pattern, COUNT: count })
      cursor = (typeof res.cursor !== 'undefined') ? `${res.cursor}` : `${res[0]}`
      const keys: string[] = Array.isArray(res.keys) ? res.keys : (res[1] || [])
      for (const key of keys || []) {
        if (!key.startsWith(CONTACT_SYNC_PENDING_PREFIX)) continue
        const phone = key.substring(CONTACT_SYNC_PENDING_PREFIX.length)
        if (phone) phones.add(phone)
      }
    } while (cursor !== '0')
    for (const phone of phones) {
      const processed = await this.runForPhone(phone)
      if (processed) {
        await delContactSyncPending(phone)
      }
    }
  }
}

export const startContactSyncScheduler = (outgoing: Outgoing) => {
  if (!CONTACT_SYNC_ENABLED || CONTACT_SYNC_INTERVAL_MS <= 0) {
    logger.info('CONTACT_SYNC disabled')
    return
  }
  if (!process.env.REDIS_URL) {
    logger.info('CONTACT_SYNC skipped: REDIS_URL not set')
    return
  }
  const job = new ContactSyncJob(outgoing)
  let running = false
  let pendingRunning = false
  const runSafe = async () => {
    if (running) return
    running = true
    try {
      await job.run()
    } catch (error) {
      logger.warn(error as any, 'CONTACT_SYNC run failed')
    } finally {
      running = false
    }
  }
  const runPendingSafe = async () => {
    if (pendingRunning) return
    pendingRunning = true
    try {
      await job.runPending()
    } catch (error) {
      logger.warn(error as any, 'CONTACT_SYNC pending run failed')
    } finally {
      pendingRunning = false
    }
  }
  void runSafe()
  void runPendingSafe()
  setInterval(() => void runSafe(), CONTACT_SYNC_INTERVAL_MS)
  setInterval(() => void runPendingSafe(), CONTACT_SYNC_PENDING_POLL_MS)
}
