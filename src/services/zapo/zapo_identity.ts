import type { SignalLidSyncResult, WaClient, WaStoredContactRecord, WaStoreSession } from 'zapo-js'
import { toRawPnJid } from '../transformer/jid'
import { SendError } from '../send_error'
import logger from '../logger'
import { zapoUsernameIndex, type ZapoUsernameIndex } from './zapo_username_index'
import { contactPhoneLookupNumbers } from './zapo_contact_phone'

const isPhoneJid = (value: string) => /^\d+@s\.whatsapp\.net$/.test(value)
const isExplicitJid = (value: string) => value.indexOf('@') > 0
const toLidJid = (value?: string | null) => {
  const raw = `${value || ''}`.trim()
  if (!raw) return undefined
  return raw.endsWith('@lid') ? raw : (/^\d+$/.test(raw) ? `${raw}@lid` : undefined)
}

export class ZapoIdentity {
  private readonly pendingPhoneLookups = new Map<string, Promise<SignalLidSyncResult | undefined>>()

  constructor(
    private readonly client: WaClient,
    private readonly store: WaStoreSession,
    private readonly phone: string,
    private readonly usernames: ZapoUsernameIndex = zapoUsernameIndex,
  ) {}

  normalize(value: string): string {
    const raw = `${value || ''}`.trim()
    if (!raw) throw new Error('recipient cannot be empty')
    return raw.includes('@') ? raw : toRawPnJid(raw)
  }

  async resolve(value: string): Promise<string> {
    return (await this.resolveMany([value]))[0]
  }

  async refreshPhoneLid(value: string): Promise<{ phoneJid: string, lidJid: string }> {
    const phoneJid = this.normalize(value)
    if (!isPhoneJid(phoneJid)) {
      throw new SendError(400, `zapo_lid_refresh_phone_required: ${value}`)
    }

    const lookups = await this.client.profile.getLidsByPhoneNumbers([phoneJid])
    const lookup = lookups.find((item) => toRawPnJid(item?.queriedJid || '') === phoneJid) || lookups[0]
    const lidJid = toLidJid(lookup?.lidJid)
    if (!lookup?.exists || !lidJid) {
      throw new SendError(404, `zapo_phone_lid_not_found: ${phoneJid.split('@')[0]}`)
    }

    const canonicalPhoneJid = toRawPnJid(lookup.phoneJid || phoneJid)
    await this.store.contacts.upsert({
      jid: lidJid,
      lid: lidJid,
      phoneNumber: canonicalPhoneJid.split('@')[0],
      lastUpdatedMs: Date.now(),
    })
    return { phoneJid: canonicalPhoneJid, lidJid }
  }

  async resolveManyPhoneJids(values: readonly string[]): Promise<string[]> {
    const resolved = await this.resolveMany(values)
    return Promise.all(resolved.map(async (jid) => {
      if (isPhoneJid(jid)) return jid

      const contact = await this.store.contacts.getByJid(jid)
      const phoneJid = toRawPnJid(contact?.phoneNumber || '')
      if (isPhoneJid(phoneJid)) return phoneJid

      throw new SendError(404, `zapo_lid_phone_not_found: ${jid.replace(/@lid$/, '')}`)
    }))
  }

  async resolveMany(values: readonly string[]): Promise<string[]> {
    const normalized = await Promise.all(values.map(async (value) => {
      const raw = `${value || ''}`.trim()
      if (raw && !isExplicitJid(raw) && /[a-z_]/i.test(raw)) {
        const lid = await this.usernames.resolve(this.phone, raw)
        if (!lid) throw new SendError(404, `zapo_username_lid_not_cached: ${raw.replace(/^@/, '')}`)
        return lid
      }
      return this.normalize(raw)
    }))
    const resolved = [...normalized]
    const phoneTargets = normalized
      .map((phoneJid, index) => ({ index, phoneJid }))
      .filter((item) => isPhoneJid(item.phoneJid))

    if (phoneTargets.length) {
      const networkTargets: typeof phoneTargets = []
      for (const target of phoneTargets) {
        const cachedLid = await this.cachedPhoneLid(target.phoneJid)
        if (cachedLid) {
          resolved[target.index] = cachedLid
          logger.debug('Zapo PN to LID resolved source=contact_store session=%s phone=%s lid=%s', this.phone, target.phoneJid, cachedLid)
        } else {
          networkTargets.push(target)
        }
      }

      let lookups: ReadonlyMap<string, SignalLidSyncResult | undefined> | undefined
      try {
        lookups = networkTargets.length
          ? await this.lookupPhonesFromNetwork(networkTargets.map((item) => item.phoneJid))
          : new Map()
      } catch {
        lookups = undefined
      }
      const contacts: WaStoredContactRecord[] = []
      for (const { index, phoneJid } of networkTargets) {
        const lookup = lookups?.get(phoneJid)
        const lid = toLidJid(lookup?.lidJid)
        if (lookup?.exists && lid) {
          const canonicalPhoneJid = toRawPnJid(lookup.phoneJid || phoneJid)
          resolved[index] = lid
          contacts.push({
            jid: lid,
            lid,
            phoneNumber: canonicalPhoneJid.split('@')[0],
            lastUpdatedMs: Date.now(),
          })
          logger.debug('Zapo PN to LID resolved source=network session=%s phone=%s lid=%s', this.phone, canonicalPhoneJid, lid)
          continue
        }
        if (lookups) continue

        // A concurrent message/contact event may have populated the store while
        // the network lookup was unavailable. Re-read once before returning 404.
        const cachedLid = await this.cachedPhoneLid(phoneJid)
        if (cachedLid) resolved[index] = cachedLid
      }
      if (contacts.length) await this.store.contacts.upsertBatch(contacts)
    }

    const unresolvedPhone = resolved.find(isPhoneJid)
    if (unresolvedPhone) {
      throw new SendError(404, `zapo_phone_lid_not_found: ${unresolvedPhone.split('@')[0]}`)
    }

    return resolved
  }

  private async cachedPhoneLid(phoneJid: string): Promise<string | undefined> {
    try {
      for (const phone of contactPhoneLookupNumbers(phoneJid)) {
        const cached = await this.store.contacts.getByPhoneNumber(phone)
          || await this.store.contacts.getByPhoneNumber(`${phone}@s.whatsapp.net`)
        const cachedLid = toLidJid(cached?.lid) || (cached?.jid?.endsWith('@lid') ? cached.jid : undefined)
        if (cachedLid) return cachedLid
      }
      return undefined
    } catch {
      return undefined
    }
  }

  private async lookupPhonesFromNetwork(phoneJids: readonly string[]): Promise<ReadonlyMap<string, SignalLidSyncResult | undefined>> {
    const uniquePhoneJids = Array.from(new Set(phoneJids))
    const newPhoneJids = uniquePhoneJids.filter((phoneJid) => !this.pendingPhoneLookups.has(phoneJid))
    if (newPhoneJids.length) {
      const batch = this.client.profile.getLidsByPhoneNumbers(newPhoneJids)
      for (let index = 0; index < newPhoneJids.length; index += 1) {
        const phoneJid = newPhoneJids[index]
        const promise = batch
          .then((items) => items.find((item) => toRawPnJid(item?.queriedJid || '') === phoneJid) || items[index])
          .finally(() => {
            if (this.pendingPhoneLookups.get(phoneJid) === promise) this.pendingPhoneLookups.delete(phoneJid)
          })
        this.pendingPhoneLookups.set(phoneJid, promise)
      }
    }

    const entries = await Promise.all(uniquePhoneJids.map(async (phoneJid) => [
      phoneJid,
      await this.pendingPhoneLookups.get(phoneJid),
    ] as const))
    return new Map(entries)
  }
}
