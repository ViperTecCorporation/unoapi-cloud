import type { SignalLidSyncResult, WaClient, WaStoredContactRecord, WaStoreSession } from 'zapo-js'
import { SendError } from '../send_error'
import {
  contactPhoneLookupNumbers,
  extractContactPhoneNumber,
  normalizeContactPhoneJid,
  normalizeContactPhoneNumber,
} from './zapo_contact_phone'

const DEFAULT_FRESHNESS_MS = 5 * 60 * 1000

type ContactStore = WaStoreSession['contacts']

export type ZapoContactResolution = {
  input: string
  queried_phone_number?: string
  canonical_phone_number?: string
  public_phone_number?: string
  lid_jid?: string
  stored?: WaStoredContactRecord | null
  source: 'network' | 'store' | 'input'
  status: 'valid' | 'invalid'
}

type ResolverOptions = {
  freshnessMs?: number
  now?: () => number
}

const toLidJid = (value?: string | null) => {
  const raw = `${value || ''}`.trim()
  if (/^\d+@lid$/.test(raw)) return raw
  return undefined
}

const isFresh = (contact: WaStoredContactRecord | null | undefined, now: number, freshnessMs: number) => {
  const updatedAt = Number(contact?.lastUpdatedMs || 0)
  return updatedAt > 0 && now - updatedAt <= freshnessMs
}

const findStoredContact = async (store: ContactStore, input: string) => {
  const candidates = contactPhoneLookupNumbers(input)
    .flatMap((phoneNumber) => [phoneNumber, `${phoneNumber}@s.whatsapp.net`])

  for (const candidate of candidates) {
    const stored = await store.getByPhoneNumber(candidate)
    if (stored) return stored
  }
  return null
}

const resultByQueriedJid = (results: readonly SignalLidSyncResult[]) => {
  const byJid = new Map<string, SignalLidSyncResult>()
  for (const result of results) {
    const queriedJid = normalizeContactPhoneJid(result?.queriedJid)
    if (queriedJid) byJid.set(queriedJid, result)
  }
  return byJid
}

export class ZapoContactIdentityResolver {
  private readonly freshnessMs: number
  private readonly now: () => number

  constructor(
    private readonly client: WaClient,
    private readonly store: ContactStore,
    options: ResolverOptions = {},
  ) {
    this.freshnessMs = Math.max(0, options.freshnessMs ?? DEFAULT_FRESHNESS_MS)
    this.now = options.now || Date.now
  }

  async resolveMany(inputs: readonly string[]): Promise<ZapoContactResolution[]> {
    const now = this.now()
    const resolutions: Array<ZapoContactResolution | undefined> = new Array(inputs.length)
    const networkTargets: Array<{
      index: number
      input: string
      queriedJid: string
      queriedPhoneNumber: string
      stored: WaStoredContactRecord | null
    }> = []

    for (let index = 0; index < inputs.length; index += 1) {
      const input = `${inputs[index] || ''}`.trim()
      const queriedJid = normalizeContactPhoneJid(input)
      const queriedPhoneNumber = normalizeContactPhoneNumber(input)
      if (!queriedJid || !queriedPhoneNumber) {
        resolutions[index] = { input: inputs[index], source: 'input', status: 'invalid' }
        continue
      }

      const stored = await findStoredContact(this.store, input)
      const storedLid = toLidJid(stored?.lid) || toLidJid(stored?.jid)
      if (storedLid && isFresh(stored, now, this.freshnessMs)) {
        const canonicalPhoneNumber = extractContactPhoneNumber(stored?.phoneNumber) || queriedPhoneNumber
        resolutions[index] = {
          input: inputs[index],
          queried_phone_number: queriedPhoneNumber,
          canonical_phone_number: canonicalPhoneNumber,
          public_phone_number: normalizeContactPhoneNumber(canonicalPhoneNumber),
          lid_jid: storedLid,
          stored,
          source: 'store',
          status: 'valid',
        }
        continue
      }

      networkTargets.push({ index, input: inputs[index], queriedJid, queriedPhoneNumber, stored })
    }

    if (networkTargets.length) {
      let results: readonly SignalLidSyncResult[]
      try {
        results = await this.client.profile.getLidsByPhoneNumbers(networkTargets.map(({ queriedJid }) => queriedJid))
        if (!Array.isArray(results)) throw new Error('zapo_contact_lookup_invalid_response')
      } catch {
        results = []
      }
      const byQueriedJid = resultByQueriedJid(results)
      const learned: WaStoredContactRecord[] = []
      let unavailable = false

      for (const target of networkTargets) {
        const result = byQueriedJid.get(target.queriedJid)
        const lidJid = toLidJid(result?.lidJid)
        if (result?.exists && lidJid) {
          const canonicalPhoneNumber = extractContactPhoneNumber(result.phoneJid) || target.queriedPhoneNumber
          const storedByLid = await this.store.getByJid(lidJid)
          const record: WaStoredContactRecord = {
            ...storedByLid,
            jid: lidJid,
            lid: lidJid,
            phoneNumber: canonicalPhoneNumber,
            lastUpdatedMs: now,
          }
          learned.push(record)
          resolutions[target.index] = {
            input: target.input,
            queried_phone_number: target.queriedPhoneNumber,
            canonical_phone_number: canonicalPhoneNumber,
            public_phone_number: normalizeContactPhoneNumber(canonicalPhoneNumber),
            lid_jid: lidJid,
            stored: record,
            source: 'network',
            status: 'valid',
          }
          continue
        }
        if (result && !result.exists) {
          resolutions[target.index] = {
            input: target.input,
            queried_phone_number: target.queriedPhoneNumber,
            source: 'network',
            status: 'invalid',
          }
          continue
        }

        const storedLid = toLidJid(target.stored?.lid) || toLidJid(target.stored?.jid)
        if (storedLid) {
          const canonicalPhoneNumber = extractContactPhoneNumber(target.stored?.phoneNumber) || target.queriedPhoneNumber
          resolutions[target.index] = {
            input: target.input,
            queried_phone_number: target.queriedPhoneNumber,
            canonical_phone_number: canonicalPhoneNumber,
            public_phone_number: normalizeContactPhoneNumber(canonicalPhoneNumber),
            lid_jid: storedLid,
            stored: target.stored,
            source: 'store',
            status: 'valid',
          }
          continue
        }
        unavailable = true
      }

      if (learned.length) await this.store.upsertBatch(learned)
      if (unavailable) throw new SendError(503, 'zapo_contact_lookup_unavailable')
    }

    return resolutions.map((resolution, index) => (
      resolution || { input: inputs[index], source: 'input', status: 'invalid' }
    ))
  }
}
