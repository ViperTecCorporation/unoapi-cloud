import type { WaClient, WaStoreSession } from 'zapo-js'
import { SendError } from '../send_error'
import type { SaveContactInput, SaveContactResponse } from '../contacts/contact_book_types'
import { ZapoIdentity } from './zapo_identity'
import { normalizeZapoPhoneJid } from './zapo_contact_resolver'

const toLidJid = (value: string) => {
  const raw = `${value || ''}`.trim()
  if (/^\d+@lid$/.test(raw)) return raw
  throw new SendError(400, 'contact_user_id_must_be_a_lid')
}

const firstWord = (value: string) => value.trim().split(/\s+/)[0]

export class ZapoContactBook {
  private readonly identity: ZapoIdentity

  constructor(
    private readonly client: WaClient,
    private readonly store: WaStoreSession,
    phone: string,
  ) {
    this.identity = new ZapoIdentity(client, store, phone)
  }

  async save(input: SaveContactInput): Promise<SaveContactResponse> {
    const requestedPhoneJid = normalizeZapoPhoneJid(input.phone_number)
    if (!requestedPhoneJid) throw new SendError(400, 'contact_phone_number_is_required')
    const fullName = `${input.full_name || ''}`.trim()
    if (!fullName) throw new SendError(400, 'contact_full_name_is_required')

    const suppliedLid = input.user_id ? toLidJid(input.user_id) : undefined
    const resolvedLid = suppliedLid || await this.identity.resolve(requestedPhoneJid)
    const stored = await this.store.contacts.getByJid(resolvedLid)
    const canonicalPhoneJid = normalizeZapoPhoneJid(`${stored?.phoneNumber || (suppliedLid ? '' : requestedPhoneJid)}`)
    if (!canonicalPhoneJid) throw new SendError(404, 'zapo_contact_phone_not_found')

    const firstName = `${input.first_name || firstWord(fullName)}`.trim()
    const username = `${input.username || ''}`.trim().replace(/^@/, '') || undefined

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
      phoneNumber: canonicalPhoneJid.split('@')[0],
      displayName: fullName,
      lastUpdatedMs: Date.now(),
    })

    return {
      success: true,
      contact: {
        phone_number: canonicalPhoneJid.split('@')[0],
        full_name: fullName,
        first_name: firstName,
        user_id: resolvedLid,
        ...(username ? { username } : {}),
      },
    }
  }
}
