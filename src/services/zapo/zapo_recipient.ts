import type { WaStoreSession } from 'zapo-js'
import { normalizeZapoPhoneJid } from './zapo_contact_resolver'

const lidFrom = (value: unknown) => {
  const raw = `${value || ''}`.trim()
  return raw.endsWith('@lid') ? raw : undefined
}

const usernameFrom = (value: unknown) => {
  const raw = `${value || ''}`.trim()
  return raw && /[a-z_]/i.test(raw) ? raw : undefined
}

export const getZapoRecipientIdentity = (payload: any): string => {
  const to = `${payload?.to || ''}`.trim()
  const toIsPhone = /^\+?\d+(?:@s\.whatsapp\.net)?$/i.test(to)
  if (to && !toIsPhone) return to

  return lidFrom(payload?.to_user_id)
    || lidFrom(payload?.toUserId)
    || lidFrom(payload?.user_id)
    || lidFrom(payload?.recipient?.user_id)
    || lidFrom(payload?.contact?.user_id)
    || usernameFrom(payload?.username)
    || usernameFrom(payload?.recipient?.username)
    || usernameFrom(payload?.contact?.username)
    || to
}

export const getZapoStoredPhone = async (
  contacts: WaStoreSession['contacts'] | undefined,
  lid: string,
): Promise<string | undefined> => {
  if (!contacts || !lid.endsWith('@lid')) return undefined
  return normalizeZapoPhoneJid(`${(await contacts.getByJid(lid))?.phoneNumber || ''}`)
}
