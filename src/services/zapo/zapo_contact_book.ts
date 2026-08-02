import type { WaClient, WaStoreSession } from 'zapo-js'
import { SendError } from '../send_error'
import type { SaveContactInput, SaveContactResponse } from '../contacts/contact_book_types'
import { ZapoContactIdentityResolver } from './zapo_contact_identity'
import { extractContactPhoneNumber, normalizeContactPhoneJid, normalizeContactPhoneNumber } from './zapo_contact_phone'
import { zapoUsernameIndex } from './zapo_username_index'

const toLidJid = (value: string) => {
  const raw = `${value || ''}`.trim()
  if (/^\d+@lid$/.test(raw)) return raw
  throw new SendError(400, 'contact_user_id_must_be_a_lid')
}

const firstWord = (value: string) => value.trim().split(/\s+/)[0]

export class ZapoContactBook {
  constructor(
    private readonly client: WaClient,
    private readonly store: WaStoreSession,
    private readonly phone: string,
    private readonly persistMapping?: (phoneJid: string, lidJid: string) => Promise<void>,
    private readonly removeMapping?: (phoneJid: string, lidJid: string) => Promise<void>,
  ) {}

  async save(input: SaveContactInput): Promise<SaveContactResponse> {
    const requestedPhoneJid = normalizeContactPhoneJid(input.phone_number)
    if (!requestedPhoneJid) throw new SendError(400, 'contact_phone_number_is_required')
    const fullName = `${input.full_name || ''}`.trim()
    if (!fullName) throw new SendError(400, 'contact_full_name_is_required')

    const suppliedLid = input.user_id ? toLidJid(input.user_id) : undefined
    const [resolution] = await new ZapoContactIdentityResolver(this.client, this.store.contacts).resolveMany([input.phone_number])
    if (resolution.status !== 'valid' || !resolution.lid_jid) {
      throw new SendError(404, 'zapo_contact_phone_not_found')
    }
    const resolvedLid = resolution.lid_jid
    const canonicalPhoneNumber = extractContactPhoneNumber(resolution.canonical_phone_number)
    const canonicalPhoneJid = canonicalPhoneNumber ? `${canonicalPhoneNumber}@s.whatsapp.net` : undefined
    const publicPhoneNumber = normalizeContactPhoneNumber(canonicalPhoneNumber)
    if (!canonicalPhoneJid || !publicPhoneNumber) throw new SendError(404, 'zapo_contact_phone_not_found')
    const stored = await this.store.contacts.getByJid(resolvedLid)

    const firstName = `${input.first_name || firstWord(fullName)}`.trim()
    const username = `${input.username || ''}`.trim().replace(/^@/, '') || undefined

    const samePhone = normalizeContactPhoneNumber(stored?.phoneNumber) === publicPhoneNumber
    const unchanged = samePhone && stored?.jid === resolvedLid && stored?.displayName === fullName

    if (!unchanged) {
      await this.client.chat.set({
        schema: 'Contact',
        id: canonicalPhoneJid,
        fullName,
        firstName,
        lidJid: resolvedLid,
        pnJid: canonicalPhoneJid,
        saveOnPrimaryAddressbook: true,
        ...(username ? { username } : {}),
      })
      await this.store.contacts.upsert({
        ...stored,
        jid: resolvedLid,
        lid: resolvedLid,
        // Keep the exact PN returned by Zapo for internal addressing.
        phoneNumber: canonicalPhoneNumber,
        displayName: fullName,
        lastUpdatedMs: Date.now(),
      })
    }

    if (!unchanged || (suppliedLid && suppliedLid !== resolvedLid)) {
      await this.persistMapping?.(canonicalPhoneJid, resolvedLid)
    }

    if (suppliedLid && suppliedLid !== resolvedLid) {
      const stale = await this.store.contacts.getByJid(suppliedLid)
      const stalePhone = normalizeContactPhoneNumber(stale?.phoneNumber)
      if (stalePhone && stalePhone === publicPhoneNumber) {
        await this.removeMapping?.(canonicalPhoneJid, suppliedLid)
        await zapoUsernameIndex.removeByLid(this.phone, suppliedLid)
        await this.store.contacts.deleteByJid(suppliedLid)
      }
    }

    return {
      success: true,
      contact: {
        phone_number: publicPhoneNumber,
        full_name: fullName,
        first_name: firstName,
        user_id: resolvedLid,
        ...(username ? { username } : {}),
      },
    }
  }
}
