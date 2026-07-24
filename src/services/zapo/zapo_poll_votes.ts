import { createHash } from 'node:crypto'
import { proto, type WaIncomingAddonEvent, type WaStoreSession } from 'zapo-js'

const optionHash = (name: string) => createHash('sha256').update(name, 'utf8').digest('hex')

const loadPollParent = async (session: WaStoreSession, messageId: string) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parent = await session.messages.getById(messageId)
    if (parent?.messageBytes?.length) return parent
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return null
}

export const resolveZapoPollVoteOptionNames = async (
  event: WaIncomingAddonEvent,
  session?: WaStoreSession,
): Promise<WaIncomingAddonEvent> => {
  const decrypted = event.decrypted
  if (event.kind !== 'poll_vote' || decrypted.kind !== 'poll_vote') return event
  if (decrypted.selectedOptionNames?.length
    && Array.from(decrypted.selectedOptionNames)
      .every((name) => typeof name === 'string' && !!name.trim())) return event

  const selectedOptions = decrypted.pollVote.selectedOptions || []
  if (!selectedOptions.length || !session) return event
  const parent = await loadPollParent(session, event.targetMessageId)
  if (!parent?.messageBytes?.length) return event

  const message = proto.Message.decode(parent.messageBytes)
  const poll = message.pollCreationMessage
    || message.pollCreationMessageV2
    || message.pollCreationMessageV3
    || message.pollCreationMessageV5
  const namesByHash = new Map(
    (poll?.options || [])
      .map((option) => `${option.optionName || ''}`)
      .filter(Boolean)
      .map((name) => [optionHash(name), name]),
  )
  const names = selectedOptions.map((selected) => namesByHash.get(Buffer.from(selected).toString('hex')))
  if (names.some((name) => !name)) return event

  return {
    ...event,
    decrypted: {
      ...decrypted,
      selectedOptionNames: names as string[],
    },
  }
}
