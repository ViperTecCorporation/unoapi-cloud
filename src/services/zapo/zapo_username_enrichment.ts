import { zapoUsernameIndex, type ZapoUsernameIndex } from './zapo_username_index'

type MessageWithIdentity = {
  key?: object
}

const asString = (value: unknown) => `${value || ''}`.trim()

export const zapoMessageSenderLid = (message: MessageWithIdentity): string | undefined => {
  const key = (message?.key || {}) as Record<string, unknown>
  const isGroup = key.isGroup === true || asString(key.remoteJid).endsWith('@g.us')
  const candidates = isGroup
    ? [key.participant, key.participantLid]
    : [key.participant, key.remoteJid, key.senderLid]
  return candidates.map(asString).find((jid) => jid.endsWith('@lid'))
}

export const enrichZapoMessageUsername = async (
  phone: string,
  message: MessageWithIdentity,
  localOnly = false,
  index: Pick<ZapoUsernameIndex, 'resolveByLid'> = zapoUsernameIndex,
): Promise<string | undefined> => {
  const key = message?.key as Record<string, unknown> | undefined
  if (!key || key.fromMe === true || key.isNewsletter === true) return undefined

  const isGroup = key.isGroup === true || asString(key.remoteJid).endsWith('@g.us')
  const existing = [key.participantUsername, key.remoteJidUsername, key.senderUsername]
    .map(asString)
    .find(Boolean)
  if (existing) return existing

  const lid = zapoMessageSenderLid(message)
  if (!lid) return undefined
  const username = await index.resolveByLid(phone, lid, Date.now(), localOnly)
  if (!username) return undefined

  if (isGroup) key.participantUsername = username
  else key.senderUsername = username
  return username
}
