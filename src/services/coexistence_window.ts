import logger from './logger'
import { BASE_KEY, redisGet, redisSetAndExpire } from './redis'

const windowKey = (phone: string, contact: string) => `${BASE_KEY}coexistence:window:${phone}:${contact}`

const normalizeContact = (raw?: string) => {
  if (!raw) return ''
  // Prefer digits for consistency across PN/LID/Cloud payloads
  const digits = raw.replace(/\D/g, '')
  return digits || raw
}

export const isWindowOpen = async (phone: string, contact: string) => {
  const key = windowKey(phone, contact)
  const val = await redisGet(key)
  return !!val
}

export const openWindow = async (phone: string, contact: string, ttlSeconds: number, reason = 'meta') => {
  if (!contact || ttlSeconds <= 0) return
  const normalized = normalizeContact(contact)
  const key = windowKey(phone, normalized)
  const payload = JSON.stringify({
    reason,
    openedAt: Date.now(),
    contact: normalized,
    ttlSeconds,
  })
  try {
    await redisSetAndExpire(key, payload, ttlSeconds)
    logger.debug('COEX window opened %s -> %s ttl=%ss reason=%s', phone, normalized, ttlSeconds, reason)
  } catch (e) {
    logger.warn(e as any, 'Failed to persist coexistence window %s -> %s', phone, normalized)
  }
}

// Best-effort extractor for incoming Meta/Cloud webhook payloads
export const registerMetaWebhookWindow = async (phone: string, payload: any, ttlSeconds: number) => {
  if (!payload || ttlSeconds <= 0) return
  const sessionDigits = normalizeContact(phone)
  const entries = Array.isArray(payload?.entry) ? payload.entry : []
  const contacts = new Set<string>()
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : []
    for (const change of changes) {
      const value = change?.value || {}
      const messages = Array.isArray(value?.messages) ? value.messages : []
      for (const message of messages) {
        const from = normalizeContact(message?.from || '')
        if (!from || from === sessionDigits) continue
        contacts.add(from)
      }
    }
  }
  for (const contact of contacts) {
    await openWindow(phone, contact, ttlSeconds, 'meta-webhook')
  }
}
