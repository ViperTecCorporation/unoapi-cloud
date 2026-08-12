import { proto } from 'zapo-js/proto'

const EXTRA_KEY_FIELDS = [
  'remoteJidAlt',
  'participantAlt',
  'senderPn',
  'participantPn',
  'senderLid',
  'participantLid',
  'recipientLid',
  'participantUsername',
  'remoteJidUsername',
  'senderUsername',
  'senderDevice',
  '__unoapiSkipTypebot',
  'isGroup',
  'isBroadcast',
  'isNewsletter',
] as const

type PackedWaMessage = {
  __wa_b64: string
  __unoapi_key?: Record<string, unknown>
  __unoapi_poll_vote?: {
    selectedOptions?: string[]
    selectedOptionNames?: string[]
  }
}

const extraKeyMetadata = (message: any) => {
  const metadata: Record<string, unknown> = {}
  for (const field of EXTRA_KEY_FIELDS) {
    const value = message?.key?.[field]
    if (value !== undefined && value !== null && value !== '') metadata[field] = value
  }
  return Object.keys(metadata).length ? metadata : undefined
}

const extraPollVoteMetadata = (message: any): PackedWaMessage['__unoapi_poll_vote'] => {
  const vote = message?.message?.pollUpdateMessage?.vote
  if (!vote) return undefined
  const selectedOptions = Array.isArray(vote.selectedOptions)
    ? vote.selectedOptions.map((option: unknown) => Buffer.from(option as any).toString('hex'))
    : undefined
  const selectedOptionNames = Array.isArray(vote.selectedOptionNames)
    ? vote.selectedOptionNames.map((name: unknown) => `${name || ''}`).filter(Boolean)
    : undefined
  if (selectedOptions === undefined && selectedOptionNames === undefined) return undefined
  return {
    ...(selectedOptions !== undefined ? { selectedOptions } : {}),
    ...(selectedOptionNames !== undefined ? { selectedOptionNames } : {}),
  }
}

export const packWaMessage = (message: any): PackedWaMessage | any => {
  if (!message || (!message.key && !message.message)) return message
  try {
    const bytes = proto.WebMessageInfo.encode(message).finish()
    const key = extraKeyMetadata(message)
    const pollVote = extraPollVoteMetadata(message)
    return {
      __wa_b64: Buffer.from(bytes).toString('base64'),
      ...(key ? { __unoapi_key: key } : {}),
      ...(pollVote ? { __unoapi_poll_vote: pollVote } : {}),
    }
  } catch {
    return message
  }
}

export const unpackWaMessage = (message: any) => {
  if (!message?.__wa_b64) return message
  try {
    const decoded: any = proto.WebMessageInfo.decode(Buffer.from(message.__wa_b64, 'base64'))
    if (message.__unoapi_key) decoded.key = { ...(decoded.key || {}), ...message.__unoapi_key }
    if (message.__unoapi_poll_vote && decoded.message?.pollUpdateMessage) {
      decoded.message.pollUpdateMessage.vote = {
        ...(decoded.message.pollUpdateMessage.vote || {}),
        ...(Array.isArray(message.__unoapi_poll_vote.selectedOptions)
          ? { selectedOptions: message.__unoapi_poll_vote.selectedOptions.map((option: string) => Buffer.from(option, 'hex')) }
          : {}),
        ...(Array.isArray(message.__unoapi_poll_vote.selectedOptionNames)
          ? { selectedOptionNames: [...message.__unoapi_poll_vote.selectedOptionNames] }
          : {}),
      }
    }
    return decoded
  } catch {
    return message
  }
}
