import type { WaStoredContactRecord, WaStoreSession } from 'zapo-js'
import { normalizeContactPhoneNumber } from '../zapo_contact_phone'

export type ZapoVoiceCallerNameSource = 'display_name' | 'push_name' | 'username'

export interface ZapoVoiceCallerIdentity {
  callerPn?: string
  callerName?: string
  callerNameSource?: ZapoVoiceCallerNameSource
}

type ContactStore = WaStoreSession['contacts']
type VoiceContact = WaStoredContactRecord & { username?: string }
type UsernameLookup = (session: string, lidJid: string) => Promise<string | undefined>
type PhoneLookup = (session: string, peerJid: string) => Promise<string | undefined>
type ResolverOptions = { attempts?: number; delayMs?: number }

const MAX_CALLER_NAME_LENGTH = 128
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]+/g

export const normalizeZapoVoiceCallerName = (value: unknown): string | undefined => {
  const normalized = `${value || ''}`
    .normalize('NFKC')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return undefined
  return Array.from(normalized).slice(0, MAX_CALLER_NAME_LENGTH).join('')
}

export const confirmedZapoVoicePhone = (value: unknown): string | undefined => {
  const raw = `${value || ''}`.trim()
  if (!raw || /@lid(?:$|:)/i.test(raw)) return undefined
  const [address, domain = ''] = raw.split('@', 2)
  if (domain && domain !== 's.whatsapp.net') return undefined
  const digits = address.split(':')[0].replace(/\D/g, '')
  return /^\d{7,20}$/.test(digits) ? normalizeContactPhoneNumber(digits) : undefined
}

const contactName = (contacts: Array<VoiceContact | null | undefined>) => {
  for (const contact of contacts) {
    const displayName = normalizeZapoVoiceCallerName(contact?.displayName)
    if (displayName) return { callerName: displayName, callerNameSource: 'display_name' as const }
  }
  for (const contact of contacts) {
    const pushName = normalizeZapoVoiceCallerName(contact?.pushName)
    if (pushName) return { callerName: pushName, callerNameSource: 'push_name' as const }
  }
  for (const contact of contacts) {
    const username = normalizeZapoVoiceCallerName(contact?.username)?.replace(/^@+/, '')
    if (username) return { callerName: `@${username}`, callerNameSource: 'username' as const }
  }
  return undefined
}

export class ZapoVoiceCallerIdentityResolver {
  constructor(
    private readonly session: string,
    private readonly contacts: ContactStore | undefined,
    private readonly usernameLookup?: UsernameLookup,
    private readonly phoneLookup?: PhoneLookup,
    private readonly options: ResolverOptions = {},
  ) {}

  async resolve(peerJid: string, callerPn?: string): Promise<ZapoVoiceCallerIdentity> {
    let contactByPeer: WaStoredContactRecord | null | undefined
    const attempts = Math.max(1, this.options.attempts ?? 1)
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        contactByPeer = await this.contacts?.getByJid(peerJid)
      } catch {
        contactByPeer = null
      }
      if (confirmedZapoVoicePhone(callerPn) || confirmedZapoVoicePhone(contactByPeer?.phoneNumber) || confirmedZapoVoicePhone(peerJid)) break
      if (attempt + 1 < attempts && (this.options.delayMs ?? 0) > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, this.options.delayMs))
      }
    }
    let confirmedPhone = confirmedZapoVoicePhone(callerPn)
      || confirmedZapoVoicePhone(contactByPeer?.phoneNumber)
      || confirmedZapoVoicePhone(peerJid)
    if (!confirmedPhone && this.phoneLookup) {
      try {
        confirmedPhone = confirmedZapoVoicePhone(await this.phoneLookup(this.session, peerJid))
      } catch {}
    }
    let contactByPhone: WaStoredContactRecord | null | undefined
    if (confirmedPhone) {
      try {
        contactByPhone = await this.contacts?.getByPhoneNumber(confirmedPhone)
      } catch {
        contactByPhone = null
      }
    }
    const contacts = [contactByPeer as VoiceContact | null | undefined, contactByPhone as VoiceContact | null | undefined]
    const resolvedName = contactName(contacts)
    if (resolvedName) return { callerPn: confirmedPhone, ...resolvedName }

    const lidJid = peerJid.endsWith('@lid') ? peerJid : contacts.find((contact) => contact?.lid?.endsWith('@lid'))?.lid
    const username = lidJid && this.usernameLookup
      ? normalizeZapoVoiceCallerName(await this.usernameLookup(this.session, lidJid).catch(() => undefined))?.replace(/^@+/, '')
      : undefined
    if (username) {
      return {
        callerPn: confirmedPhone,
        callerName: `@${username}`,
        callerNameSource: 'username',
      }
    }

    return {
      callerPn: confirmedPhone,
      ...(confirmedPhone ? { callerName: confirmedPhone } : {}),
    }
  }
}
