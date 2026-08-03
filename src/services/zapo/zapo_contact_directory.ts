import { ZAPO_REDIS_KEY_PREFIX } from '../../defaults'
import type { getConfig } from '../config'
import { getProfilePicture, getRedis } from '../redis'
import { SendError } from '../send_error'
import type { ContactDirectory, ContactDirectoryItem, ContactDirectoryPage, ContactDirectoryQuery } from '../contacts/contact_directory_types'
import { profilePictureCacheIds } from '../profile_picture_cache'
import { resolveZapoRedisKeyPrefix } from './zapo_store'
import { normalizeContactPhoneNumber } from './zapo_contact_phone'

export { normalizeContactPhoneNumber } from './zapo_contact_phone'

type RedisClient = Awaited<ReturnType<typeof getRedis>>
type RedisFactory = () => Promise<RedisClient>
type PictureLookup = (phone: string, cacheId: string) => Promise<string | null | undefined>
type StoredContact = Record<string, string>
type ContactCounts = {
  total_count: number
  raw_total_count: number
  ignored_count: number
}
type ContactCounter = (redis: RedisClient, pattern: string) => Promise<ContactCounts | number>

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 200

export const mapStoredZapoContact = (contact: StoredContact): ContactDirectoryItem | undefined => {
  const userId = `${contact.lid || contact.jid || ''}`.trim()
  if (!userId.endsWith('@lid')) return undefined

  return {
    user_id: userId,
    phone_number: normalizeContactPhoneNumber(contact.phone_number),
    display_name: `${contact.display_name || ''}`.trim() || undefined,
    push_name: `${contact.push_name || ''}`.trim() || undefined,
    username: `${contact.username || ''}`.trim() || undefined,
    last_updated_ms: Number(contact.last_updated_ms) || 0,
  }
}

const escapeRedisGlob = (value: string) => value.replace(/([*?\[\]\\])/g, '\\$1')

export const countContactKeys = async (
  redis: RedisClient,
  pattern: string,
): Promise<number> => {
  let cursor = '0'
  let count = 0
  const visited = new Set<string>()
  do {
    if (visited.has(cursor)) break
    visited.add(cursor)
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 1000 })
    count += result.keys?.length || 0
    cursor = `${result.cursor}`
  } while (cursor !== '0')
  return count
}

export const countContactKeyKinds = async (
  redis: RedisClient,
  pattern: string,
): Promise<ContactCounts> => {
  let cursor = '0'
  let rawTotalCount = 0
  let totalCount = 0
  const visited = new Set<string>()
  do {
    if (visited.has(cursor)) break
    visited.add(cursor)
    const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 1000 })
    const keys = result.keys || []
    rawTotalCount += keys.length
    totalCount += keys.filter((key) => key.endsWith('@lid')).length
    cursor = `${result.cursor}`
  } while (cursor !== '0')
  return {
    total_count: totalCount,
    raw_total_count: rawTotalCount,
    ignored_count: rawTotalCount - totalCount,
  }
}

export const findCachedContactPicture = async (
  phone: string,
  contact: ContactDirectoryItem,
  lookup: PictureLookup = getProfilePicture,
): Promise<string | undefined> => {
  const identities = [contact.user_id, contact.phone_number ? `${contact.phone_number}@s.whatsapp.net` : '']
  const cacheIds = [...new Set(identities.flatMap(profilePictureCacheIds))]
  for (const cacheId of cacheIds) {
    const picture = await lookup(phone, cacheId)
    if (picture) return picture
  }
  return undefined
}

export class ZapoContactDirectory implements ContactDirectory {
  private readonly prefix: string

  constructor(
    private readonly loadConfig: getConfig,
    private readonly redisFactory: RedisFactory = getRedis,
    prefix = ZAPO_REDIS_KEY_PREFIX,
    private readonly pictureLookup: PictureLookup = getProfilePicture,
    private readonly counter: ContactCounter = countContactKeyKinds,
  ) {
    this.prefix = resolveZapoRedisKeyPrefix(prefix)
  }

  async list(phone: string, query: ContactDirectoryQuery = {}): Promise<ContactDirectoryPage> {
    const config = await this.loadConfig(phone)
    if (config.provider !== 'zapo') throw new SendError(409, 'contact_directory_requires_zapo_provider')

    const cursor = /^\d+$/.test(`${query.cursor || '0'}`) ? `${query.cursor || '0'}` : '0'
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(query.limit || DEFAULT_LIMIT)))
    const redis = await this.redisFactory()
    const pattern = `${this.prefix}contact:${escapeRedisGlob(phone)}:*`
    const contactCounts = this.counter(redis, pattern)
    let storePromise: ReturnType<typeof config.getStore> | undefined
    const pictureLookup: PictureLookup = async (sessionPhone, cacheId) => {
      const cached = await this.pictureLookup(sessionPhone, cacheId)
      if (cached) return cached
      try {
        storePromise ||= config.getStore(phone, config)
        const store = await storePromise
        return store.dataStore.getImageUrl(cacheId)
      } catch {
        return undefined
      }
    }
    let nextCursor = cursor
    const mapped: ContactDirectoryItem[] = []
    const search = `${query.search || ''}`.trim().toLowerCase()
    const visited = new Set<string>()
    do {
      if (visited.has(nextCursor)) break
      visited.add(nextCursor)
      const result = await redis.scan(nextCursor, {
        MATCH: pattern,
        // Redis COUNT applies before MATCH, so small values can return only
        // one session contact from a keyspace shared by messages and auth.
        COUNT: Math.max(500, limit * 10),
      })
      const stored = await Promise.all((result.keys || []).map((key) => redis.hGetAll(key)))
      const batch = stored
        .map(mapStoredZapoContact)
        .filter((contact): contact is ContactDirectoryItem => !!contact)
        .filter(
          (contact) =>
            !search ||
            [contact.display_name, contact.push_name, contact.username, contact.phone_number, contact.user_id].some((value) =>
              `${value || ''}`.toLowerCase().includes(search),
            ),
        )
      mapped.push(...batch)
      nextCursor = `${result.cursor}`
    } while (nextCursor !== '0' && mapped.length < limit)
    const contacts = await Promise.all(
      mapped.map(async (contact) => ({
        ...contact,
        picture: await findCachedContactPicture(phone, contact, pictureLookup),
      })),
    )
    contacts.sort((left, right) => right.last_updated_ms - left.last_updated_ms)
    const counted = await contactCounts
    const counts = typeof counted === 'number'
      ? { total_count: counted, raw_total_count: counted, ignored_count: 0 }
      : counted
    return {
      contacts,
      next_cursor: nextCursor,
      has_more: nextCursor !== '0',
      ...counts,
    }
  }
}
