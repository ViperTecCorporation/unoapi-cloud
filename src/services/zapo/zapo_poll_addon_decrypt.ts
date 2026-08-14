import type { WaIncomingAddonEvent, WaIncomingMessageEvent, WaStoreSession } from 'zapo-js'
import type { WaMessageSecretEntry, WaStoredMessageRecord } from 'zapo-js/store'
import {
  buildAddonAdditionalData,
  decodeAddonPlaintext,
  decryptAddonPayload,
  identifyEncryptedAddon,
  resolveParentMessageSecret,
  resolvePollOptionNames,
  shouldUseAddonAdditionalData,
} from 'zapo-js/message'
import logger from '../logger'

type PollDecryptOptions = {
  attempts?: number
  delayMs?: number
}

const uniqueJids = (values: unknown[]) => Array.from(new Set(
  values
    .map((value) => `${value || ''}`.trim())
    .filter((value) => value.includes('@')),
))

/**
 * Decrypts poll votes while accounting for PN/LID identity mixing.
 *
 * Zapo's default addon path uses one creator and one voter JID. WhatsApp may
 * encrypt the same vote with either identity, especially for group messages
 * and own-device echoes, so the authenticated combinations must be attempted.
 */
export const decryptZapoPollVoteWithJidFallback = async (
  event: WaIncomingMessageEvent,
  session?: WaStoreSession,
  options: PollDecryptOptions = {},
): Promise<WaIncomingAddonEvent | null> => {
  if (!event.message || !session) return null
  const addon = identifyEncryptedAddon(event.message)
  if (!addon || addon.kind !== 'poll_vote') return null

  const targetMessageId = `${addon.targetMessageKey.id || ''}`.trim()
  if (!targetMessageId) return null
  const attempts = Math.max(1, options.attempts ?? 10)
  const delayMs = Math.max(0, options.delayMs ?? 100)
  const auth = await session.auth.load()
  let parentEntry: WaMessageSecretEntry | null = null
  let parentRecord: WaStoredMessageRecord | null = null
  let contextAttempt = 0
  for (; contextAttempt < attempts; contextAttempt += 1) {
    ;[parentEntry, parentRecord] = await Promise.all([
      resolveParentMessageSecret(targetMessageId, session.messageSecret, session.messages),
      session.messages.getById(targetMessageId),
    ])
    if (parentEntry) break
    if (contextAttempt < attempts - 1 && delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  if (!parentEntry) return null

  const creatorCandidates = uniqueJids([
    parentEntry.senderJid,
    parentRecord?.senderJid,
    parentRecord?.participantJid,
    addon.targetMessageKey.participant,
    addon.targetMessageKey.fromMe ? auth?.meJid : undefined,
    addon.targetMessageKey.fromMe ? auth?.meLid : undefined,
    `${addon.targetMessageKey.remoteJid || ''}`.endsWith('@g.us') ? undefined : addon.targetMessageKey.remoteJid,
  ])
  const voterCandidates = uniqueJids([
    event.key.participant,
    event.key.participantAlt,
    event.key.fromMe ? auth?.meJid : undefined,
    event.key.fromMe ? auth?.meLid : undefined,
    event.key.isGroup ? undefined : event.key.remoteJid,
    event.key.isGroup ? undefined : event.key.remoteJidAlt,
  ])
  if (!creatorCandidates.length || !voterCandidates.length) return null

  let emptyResult: WaIncomingAddonEvent | null = null
  for (const [creatorIndex, parentMsgOriginalSender] of creatorCandidates.entries()) {
    for (const [voterIndex, modificationSender] of voterCandidates.entries()) {
      try {
        const plaintext = await decryptAddonPayload({
          messageSecret: parentEntry.secret,
          stanzaId: targetMessageId,
          parentMsgOriginalSender,
          modificationSender,
          modificationType: addon.modificationType,
          ciphertext: addon.encPayload,
          iv: addon.encIv,
          additionalData: shouldUseAddonAdditionalData(addon.modificationType)
            ? buildAddonAdditionalData(targetMessageId, modificationSender)
            : undefined,
        })
        let decrypted = decodeAddonPlaintext('poll_vote', plaintext)
        if (decrypted.kind !== 'poll_vote') continue
        const selectedOptions = decrypted.pollVote.selectedOptions || []
        if (selectedOptions.length) {
          const names = await resolvePollOptionNames(selectedOptions, targetMessageId, session.messages)
          if (names) decrypted = { ...decrypted, selectedOptionNames: names }
        }
        const result: WaIncomingAddonEvent = {
          rawNode: event.rawNode,
          key: event.key,
          stanzaType: event.stanzaType,
          offline: event.offline,
          kind: 'poll_vote',
          targetMessageId,
          decrypted,
          raw: event.message,
        }
        if (selectedOptions.length) {
          logger.info(
            'Zapo poll vote decrypted id=%s parent=%s selected=%s cipher_bytes=%s plain_bytes=%s context_attempt=%s creator_candidate=%s voter_candidate=%s',
            event.key.id || '<none>',
            targetMessageId,
            selectedOptions.length,
            addon.encPayload.byteLength,
            plaintext.byteLength,
            contextAttempt + 1,
            creatorIndex + 1,
            voterIndex + 1,
          )
          return result
        }
        emptyResult ||= result
      } catch {
        // AES-GCM authentication rejects identity combinations that were not
        // used by WhatsApp. Continue with the next PN/LID candidate.
      }
    }
  }
  if (emptyResult) {
    logger.info(
      'Zapo poll vote decrypted as removal id=%s parent=%s cipher_bytes=%s context_attempt=%s',
      event.key.id || '<none>',
      targetMessageId,
      addon.encPayload.byteLength,
      contextAttempt + 1,
    )
  }
  return emptyResult
}
