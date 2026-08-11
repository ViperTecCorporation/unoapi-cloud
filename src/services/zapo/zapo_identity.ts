import type { SignalLidSyncResult, WaClient, WaStoredContactRecord, WaStoreSession } from 'zapo-js'
import { toRawPnJid } from '../transformer/jid'
import { SendError } from '../send_error'
import { zapoUsernameIndex, type ZapoUsernameIndex } from './zapo_username_index'

const isPhoneJid = (value: string) => /^\d+@s\.whatsapp\.net$/.test(value)
const isExplicitJid = (value: string) => value.indexOf('@') > 0
const toLidJid = (value?: string | null) => {
  const raw = `${value || ''}`.trim()
  if (!raw) return undefined
  return raw.endsWith('@lid') ? raw : (/^\d+$/.test(raw) ? `${raw}@lid` : undefined)
}

export class ZapoIdentity {
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
      let lookups: readonly SignalLidSyncResult[] | undefined
      try {
        lookups = await this.client.profile.getLidsByPhoneNumbers(phoneTargets.map((item) => item.phoneJid))
      } catch {
        lookups = undefined
      }
      const contacts: WaStoredContactRecord[] = []
      for (let i = 0; i < phoneTargets.length; i += 1) {
        const { index, phoneJid } = phoneTargets[i]
        const lookup = lookups?.find((item) => toRawPnJid(item?.queriedJid || '') === phoneJid) || lookups?.[i]
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
          continue
        }
        if (lookups) continue

        const phone = phoneJid.split('@')[0]
        const cached = await this.store.contacts.getByPhoneNumber(phone)
          || await this.store.contacts.getByPhoneNumber(phoneJid)
        const cachedLid = toLidJid(cached?.lid) || (cached?.jid?.endsWith('@lid') ? cached.jid : undefined)
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
}
