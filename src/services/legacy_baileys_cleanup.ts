import { configs } from './config'
import {
  BASE_KEY,
  delAuth,
  delConfig,
  delSessionStatus,
  delSessionTransientKeys,
  redisDelKey,
  redisKeys,
} from './redis'

export type LegacyBaileysCleanup = (phone: string) => Promise<void>

export const legacyBaileysKeyPatterns = (phone: string): string[] => {
  const session = `${phone || ''}`.replace(/\D/g, '')
  if (!session) throw new Error('invalid_legacy_session_phone')
  return [
    `${BASE_KEY}connect-count:${session}:*`,
    `${BASE_KEY}message-status:${session}:*`,
    `${BASE_KEY}media:${session}:*`,
    `${BASE_KEY}bulk-message:${session}:*`,
    `${BASE_KEY}bulk-index:${session}:*`,
    `${BASE_KEY}message:${session}:*`,
    `${BASE_KEY}contact-sync:pending:${session}`,
    `${BASE_KEY}poll-state:${session}:*`,
    `${BASE_KEY}status-media:${session}:*`,
    `${BASE_KEY}template:${session}`,
    `${BASE_KEY}key:${session}:*`,
    `${BASE_KEY}id:${session}:*`,
    `${BASE_KEY}id_rev:${session}:*`,
    `${BASE_KEY}jid:${session}:*`,
    `${BASE_KEY}profile-picture:${session}:*`,
    `${BASE_KEY}group:${session}:*`,
    `${BASE_KEY}jidmap:${session}:*`,
    `${BASE_KEY}jidmap:cursor:${session}:*`,
    `${BASE_KEY}webhook-cb:${session}:*`,
    `${BASE_KEY}ratelimit:${session}:*`,
    `${BASE_KEY}preassert:1to1:${session}:*`,
    `${BASE_KEY}coexistence:window:${session}:*`,
    `${BASE_KEY}status-recipients:${session}`,
    `${BASE_KEY}profile-picture-miss:${session}`,
    `${BASE_KEY}profile-picture-webhook:${session}`,
    `${BASE_KEY}missing-tctoken:${session}`,
    `${BASE_KEY}zapo-username-lid:${session}`,
  ]
}

const clearLegacySessionData = async (phone: string): Promise<void> => {
  for (const pattern of legacyBaileysKeyPatterns(phone)) {
    const keys = await redisKeys(pattern)
    await Promise.all(keys.map((key) => redisDelKey(key)))
  }
}

export const clearLegacyBaileysSession: LegacyBaileysCleanup = async (phone) => {
  await delAuth(phone)
  await delSessionTransientKeys(phone)
  await clearLegacySessionData(phone)
  await delSessionStatus(phone)
  await delConfig(phone)
  configs.delete(phone)
}
