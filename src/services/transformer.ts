import { AnyMessageContent, WAMessageContent, WAMessage, isJidNewsletter, isPnUser, isLidUser, proto, jidNormalizedUser } from '@whiskeysockets/baileys'
import mime from 'mime-types'
import { parsePhoneNumber } from 'awesome-phonenumber'
import vCard from 'vcf'
import logger from './logger'
import { Config } from './config'
import { MESSAGE_CHECK_WAAPP, SEND_AUDIO_MESSAGE_AS_PTT } from '../defaults'
import { t } from '../i18n'

export const TYPE_MESSAGES_TO_PROCESS_FILE = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage']

export const TYPE_MESSAGES_MEDIA = ['image', 'audio', 'document', 'video', 'sticker']

const MESSAGE_STUB_TYPE_ERRORS = [
  'Message absent from node'.toLowerCase(),
  'Invalid PreKey ID'.toLowerCase(),
  'Key used already or never filled'.toLowerCase(),
  'No SenderKeyRecord found for decryption'.toLowerCase(),
  'No session record'.toLowerCase(),
  'No matching sessions found for message'.toLowerCase(),
]

export class BindTemplateError extends Error {
  constructor() {
    super('')
  }
}

export class DecryptError extends Error {
  private content: object

  constructor(content: object) {
    super('')
    this.content = content
  }

  getContent() {
    return this.content
  }
}

export const TYPE_MESSAGES_TO_READ = [
  'viewOnceMessage',
  'editedMessage',
  'ephemeralMessage',
  'documentWithCaptionMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'stickerMessage',
  'documentMessage',
  'contactMessage',
  'contactsArrayMessage',
  'extendedTextMessage',
  'reactionMessage',
  'locationMessage',
  'liveLocationMessage',
  'listResponseMessage',
  'conversation',
  'ptvMessage',
]

const OTHER_MESSAGES_TO_PROCESS = [
  'protocolMessage',
  'senderKeyDistributionMessage',
  'messageContextInfo',
  'messageStubType',
]

export const getMimetype = (payload: any) => {
  const { type } = payload
  const link = payload[type].link

  let mimetype: string | boolean = mime.lookup(link.split('?')[0])
  if (!mimetype) {
    let url
    try {
      url = new URL(link)
    } catch (error) {
      logger.error(`Error on parse url: ${link}`)
    }
    if (url) {
      mimetype = url.searchParams.get('response-content-type')
      if (!mimetype) {
        const contentDisposition = url.searchParams.get('response-content-disposition')
        if (contentDisposition) {
          const filename = contentDisposition.split('filename=')[1].split(';')[0]
          if (filename) {
            mimetype = mime.lookup(filename)
          }
        }
      }
    }
  }
  if (type == 'audio') {
    if (mimetype == 'audio/ogg') {
      mimetype = 'audio/ogg; codecs=opus'
    } else if (!mimetype) {
      mimetype = 'audio/mpeg'
    }
  }
  if (payload[type].filename) {
    if (!mimetype) {
      mimetype = mime.lookup(payload[type].filename)
    }
  }
  return mimetype ? `${mimetype}` : 'application/unknown'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getMessageType = (payload: any) => {
  if (payload.update) {
    return 'update'
  } else if (payload.status && ![2, '2', 'SERVER_ACK'].includes(payload.status) && !payload.key.fromMe) {
    return 'update'
  } else if (payload.receipt) {
    return 'receipt'
  } else if (payload.message) {
    const { message } = payload
    return TYPE_MESSAGES_TO_READ.find((t) => message[t]) || 
            OTHER_MESSAGES_TO_PROCESS.find((t) => message[t]) || 
            Object.keys(payload.message)[0]
  } else if (payload.messageStubType) {
    return 'messageStubType'
  }
}

export const isSaveMedia = (message: WAMessage) => {
  const normalizedMessage = getNormalizedMessage(message)
  const messageType = normalizedMessage && getMessageType(normalizedMessage)
  return messageType && TYPE_MESSAGES_TO_PROCESS_FILE.includes(messageType)
}

export const normalizeMessageContent = (
  content: WAMessageContent | null | undefined
): WAMessageContent | proto.IMessage | undefined => {
  content =
    // unwrap edited message to original content
    content?.editedMessage?.message ||
    (content as any)?.protocolMessage?.editedMessage?.message ||
    content?.ephemeralMessage?.message?.viewOnceMessage?.message ||
    content?.ephemeralMessage?.message ||
    content?.viewOnceMessage?.message ||
    content?.viewOnceMessageV2Extension?.message ||
    content?.viewOnceMessageV2?.message ||
		content?.documentWithCaptionMessage?.message ||
    content ||
    undefined;
  return (content || undefined) as any;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getBinMessage = (waMessage: WAMessage): { messageType: string; message: any } | undefined => {
  const message: proto.IMessage | undefined = (normalizeMessageContent(waMessage.message) || undefined) as any
  const messageType = getMessageType({ message })
  if (message && messageType && message[messageType]) {
    return { messageType, message: message[messageType] }
  }
}

export const getNormalizedMessage = (waMessage: WAMessage): WAMessage | undefined => {
  const binMessage = getBinMessage(waMessage)
  if (binMessage) {
    let { message } = binMessage
    // unwrap edited message to the inner original message
    if (message?.editedMessage?.message) {
      message = message.editedMessage.message
    } else if (message?.protocolMessage?.editedMessage?.message) {
      message = message.protocolMessage.editedMessage.message
    }
    return { key: waMessage.key, message: { [binMessage.messageType]: message } }
  }
}

export const completeCloudApiWebHook = (phone, to: string, message: object) => {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: phone,
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: phone,
                phone_number_id: phone,
              },
              messages: [message],
              contacts: [
                {
                  profile: {
                    name: to,
                  },
                  wa_id: to,
                },
              ],
              statuses: [],
              errors: [],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toBaileysMessageContent = (payload: any, customMessageCharactersFunction = (m) => m): AnyMessageContent => {
  const { type } = payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: any = {}
  switch (type) {
    case 'text':
      response.text = customMessageCharactersFunction(payload.text.body)
      break
    case 'interactive':
      let listMessage = {}
      if (payload.interactive.header) {
        listMessage = {
          title: payload.interactive.header.text,
          description: payload.interactive.body.text,
          buttonText: payload.interactive.action.button,
          footerText: payload.interactive.footer.text,
          sections: payload.interactive.action.sections.map(
            (section: { title: string; rows: { title: string; rowId: string; description: string }[] }) => {
              return {
                title: section.title,
                rows: section.rows.map((row: { title: string; rowId: string; description: string }) => {
                  return {
                    title: row.title,
                    rowId: row.rowId,
                    description: row.description,
                  }
                }),
              }
            },
          ),
          listType: 2,
        }
      } else {
        listMessage = {
          title: '',
          description: payload.interactive.body.text || 'Nenhuma descriçao encontrada',
          buttonText: 'Selecione',
          footerText: '',
          sections: [
            {
              title: 'Opcões',
              rows: payload.interactive.action.buttons.map((button: { reply: { title: string; id: string; description: string } }) => {
                return {
                  title: button.reply.title,
                  rowId: button.reply.id,
                  description: '',
                }
              }),
            },
          ],
          listType: 2,
        }
      }
      response.listMessage = listMessage
      break
    case 'image':
    case 'audio':
    case 'document':
    case 'video':
      const link = payload[type].link
      if (link) {
        let mimetype: string = getMimetype(payload)
        if (type == 'audio' && SEND_AUDIO_MESSAGE_AS_PTT) {
          response.ptt = true
        }
        if (payload[type].filename) {
          response.fileName = payload[type].filename
        }
        if (mimetype) {
          response.mimetype = mimetype
        }
        if (payload[type].caption) {
          response.caption = customMessageCharactersFunction(payload[type].caption)
        }
        response[type] = { url: link }
        break
      }

    case 'contacts':
      const contact = payload[type][0]
      const contacName = contact['name']['formatted_name']
      const contacts: any[] = []
      for (let index = 0; index < contact['phones'].length; index++) {
        const phone = contact['phones'][index]
        const waid = phone['wa_id']
        const number = phone['phone']
        const vcard = 'BEGIN:VCARD\n'
              + 'VERSION:3.0\n'
              + `N:${contacName}\n`
              + `TEL;type=CELL;type=VOICE;waid=${waid}:${number}\n`
              + 'END:VCARD'
        contacts.push({ vcard })
      }
      const displayName = contact['phones'].length > 1 ? `${contact['phones'].length} contacts` : contacName
      response[type] = { displayName, contacts }
      break

    case 'template':
      throw new BindTemplateError()

    default:
      throw new Error(`Unknow message type ${type}`)
  }
  return response
}

export const phoneNumberToJid = (phoneNumber: string) => {
  try {
    if (typeof phoneNumber === 'string' && phoneNumber.includes('@')) {
      logger.debug('%s already is jid', phoneNumber)
      return phoneNumber
    }
    // PN -> JID com ajuste do 9º dígito (Brasil)
    const raw = ensurePn(`${phoneNumber}`)
    const brMobile9 = (digits?: string) => {
      try {
        const s = `${digits || ''}`.replace(/\D/g, '')
        if (!s.startsWith('55')) return s
        // 55 + DDD(2) + local; se local tiver 8 dígitos e começar em [6-9], inserir 9 após DDD
        if (s.length === 12) {
          const ddd = s.slice(2, 4)
          const local = s.slice(4)
          if (/[6-9]/.test(local[0])) return `55${ddd}9${local}`
        }
        return s
      } catch { return digits || '' }
    }
    const pn = brMobile9(raw)
    const jid = `${pn}@s.whatsapp.net`
    logger.debug('PN->JID transform %s => %s', phoneNumber, jid)
    return jid
  } catch {
    const jid = `${`${phoneNumber}`.replace(/\D/g, '')}@s.whatsapp.net`
    logger.debug('PN->JID fallback %s => %s', phoneNumber, jid)
    return jid
  }
}

export const isIndividualJid = (jid: string) => {
  // Treat only PN JIDs (or raw numbers) as individual for phone extraction paths
  const isIndividual = isPnUser(jid) || jid.indexOf('@') < 0
  logger.debug('jid %s is individual? %s', jid, isIndividual)
  return isIndividual
}

// Garante PN (somente dígitos) a partir de número/JID (PN/LID)
// Retorna string vazia quando não conseguir inferir com segurança
export const ensurePn = (value?: string): string => {
  try {
    if (!value) return ''
    // se já for só números (com ou sem +)
    if (/^\+?\d+$/.test(value)) return value.replace('+', '')
    // se for JID, normaliza (remove device suffix e resolve LID->PN quando possível)
    const jid = value.includes('@') ? formatJid(value) : value
    try {
      const normalized = jidNormalizedUser(jid as any)
      if (isPnUser(normalized)) {
        return jidToPhoneNumber(normalized, '').replace('+', '')
      }
    } catch {}
    // tenta converter diretamente se já parecer PN JID
    if (isPnUser(jid as any)) {
      return jidToPhoneNumber(jid, '').replace('+', '')
    }
  } catch {}
  return ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isIndividualMessage = (payload: any) => {
  const {
    key: { remoteJid },
  } = payload
  return isIndividualJid(remoteJid)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getChatAndNumberAndId = (payload: any): [string, string, string] => {
  const { key: { remoteJid } } = payload
  const split = remoteJid.split('@')
  const id = `${split[0].split(':')[0]}@${split[1]}`
  if (isIndividualJid(remoteJid)) {
    return [id, jidToPhoneNumber(remoteJid, ''), id]
  } else {
    return [id, ...getNumberAndId(payload)]
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getNumberAndId = (payload: any): [string, string] => {
  const {
    key: {
      remoteJid,
      senderPn,
      participantPn,
      participant,
      senderLid,
      participantLid,
      // Baileys >=6.8 alt JIDs
      remoteJidAlt,
      participantAlt,
    } = {},
    participant: participant2,
    participantPn: participantPn2,
    participantAlt: participantAlt2,
  } = payload || {}

  // Normalize base ID (can be PN or LID)
  const lid = senderLid || participantLid || participant || participant2 || remoteJid || ''
  const split = `${lid}`.split('@')
  const id = split.length >= 2 ? `${split[0].split(':')[0]}@${split[1]}` : `${lid}`

  // Prefer a PN JID if any is available (explicit PN fields or alt PN fields)
  const pnCandidate = participantPn || senderPn || participantPn2 || participant || participant2 || remoteJidAlt || participantAlt || participantAlt2
  const pnIsValid = pnCandidate && isPnUser(pnCandidate)
  let phone: string | undefined
  if (pnIsValid) {
    phone = jidToPhoneNumber(pnCandidate, '')
  } else {
    // Prefer explicit PN fields first — accept both PN JIDs and plain digits
    if (!phone && typeof participantPn === 'string') {
      if (isPnUser(participantPn as any)) {
        phone = jidToPhoneNumber(participantPn, '')
      } else if (/^\+?\d+$/.test(participantPn)) {
        // aplicar regra BR do 9º dígito como em phoneNumberToJid
        try { phone = jidToPhoneNumber(phoneNumberToJid(participantPn), '') } catch { phone = ensurePn(participantPn) }
      }
    }
    if (!phone && typeof senderPn === 'string') {
      if (isPnUser(senderPn as any)) {
        phone = jidToPhoneNumber(senderPn, '')
      } else if (/^\+?\d+$/.test(senderPn)) {
        try { phone = jidToPhoneNumber(phoneNumberToJid(senderPn), '') } catch { phone = ensurePn(senderPn) }
      }
    }
    // Then try map from group metadata participants (if present): find PN by LID
    if (!phone) {
      try {
        const participants: any[] = (payload?.groupMetadata?.participants || []) as any[]
        if (participants?.length) {
          const lidCandidate = senderLid || participantLid || participant || participant2 || participantAlt || participantAlt2 || remoteJidAlt
          const found = participants.find((p: any) => (p?.lid || '').toString() === (lidCandidate || '').toString())
          const pnFromGroup = found?.id || found?.jid
          if (pnFromGroup && isPnUser(pnFromGroup)) {
            phone = jidToPhoneNumber(pnFromGroup, '')
          }
        }
      } catch {}
    }
    // Then derive PN from any LID candidate
    if (!phone) {
      const lidCandidate = senderLid || participantLid || participant || participant2 || participantAlt || participantAlt2 || remoteJidAlt
      try {
        if (lidCandidate && isLidUser(lidCandidate)) {
          phone = jidToPhoneNumber(jidNormalizedUser(lidCandidate), '')
        }
      } catch {}
    }
    // Last resort: normalize the base id (may be LID) and extract PN
    if (!phone) {
      try {
        const normalized = jidNormalizedUser(id)
        phone = jidToPhoneNumber(normalized, '')
      } catch {
        phone = id
      }
    }
  }
  return [phone!, id]
}

export const formatJid = (jid: string) => {
  const jidSplit = jid.split('@')
  return `${jidSplit[0].split(':')[0]}@${jidSplit[1]}`
}

export const isValidPhoneNumber = (value: string, nine = false): boolean => {
  const number = `+${(value || '').split('@')[0].split(':')[0].replace('+', '')}`
  const country = number.replace('+', '').substring(0, 2)
  const parsed = parsePhoneNumber(number)
  const numbers = parsed?.number?.significant || ''
  const isInValid = !parsed.valid || !parsed.possible || (nine && country == '55' && numbers.length < 11 && ['6', '7', '8', '9'].includes(numbers[2]))
  if (isInValid) {
    logger.warn('phone number %s is invalid %s', value, isInValid)
  }
  return !isInValid
}

export const extractDestinyPhone = (payload: object, throwError = true) => {
  const data = payload as any
  let number = data?.to || (
    (
      data?.entry
      && data.entry[0]
      && data.entry[0].changes
      && data.entry[0].changes[0]
      && data.entry[0].changes[0].value
    ) && (
      (
        data.entry[0].changes[0].value.contacts
        && data.entry[0].changes[0].value.contacts[0]
        && data.entry[0].changes[0].value.contacts[0].wa_id?.replace('+', '')
      ) || (
        data.entry[0].changes[0].value.statuses
        && data.entry[0].changes[0].value.statuses[0]
        && data.entry[0].changes[0].value.statuses[0].recipient_id?.replace('+', '')
      )
    )
  )
  // Normalize JIDs (LID/PN) to plain phone when possible
  try {
    if (typeof number === 'string' && number.includes('@')) {
      // Prefer a normalized PN JID, then extract phone if it's an individual user
      const normalizedJid = jidNormalizedUser(number)
      number = jidToPhoneNumberIfUser(normalizedJid).replace('+', '')
    }
  } catch {}
  if (!number && throwError) {
    throw Error(`error on get phone number from ${JSON.stringify(payload)}`)
  }
  return number
}
export const extractFromPhone = (payload: object, throwError = true) => {
  const data = payload as any
  const number =
    data?.entry
    && data.entry[0]
    && data.entry[0].changes
    && data.entry[0].changes[0]
    && data.entry[0].changes[0].value
    && data.entry[0].changes[0].value.messages
    && data.entry[0].changes[0].value.messages[0]
    && data.entry[0].changes[0].value.messages[0].from?.replace('+', '')
  if (!number && throwError) {
    throw Error(`error on get phone number from ${JSON.stringify(payload)}`)
  }
  return number
}

export const getGroupId = (payload: object) => {
  const data = payload as any
  return (
      data.entry
      && data.entry[0]
      && data.entry[0].changes
      && data.entry[0].changes[0]
      && data.entry[0].changes[0].value
    ) && (
      (
        data.entry[0].changes[0].value.contacts
        && data.entry[0].changes[0].value.contacts[0]
        && data.entry[0].changes[0].value.contacts[0].group_id
      )
    )
}

export const isGroupMessage = (payload: object) => {
  return !!getGroupId(payload)
}

export const isNewsletterMessage = (payload: object) => {
  const groupId = getGroupId(payload)
  return groupId && isJidNewsletter(groupId)
}

export const extractSessionPhone  = (payload: object) => {
  const data = payload as any
  const session = data.entry
                && data.entry[0]
                && data.entry[0].changes 
                && data.entry[0].changes[0].value.messages
                && data.entry[0].changes[0].value.metadata
                && data.entry[0].changes[0].value.metadata.display_phone_number

  return `${(session || '')}`.replaceAll('+', '')
}

export const isOutgoingMessage = (payload: object) => {
  const from = extractFromPhone(payload, false)
  const session = extractSessionPhone(payload)
  return session && from && session == from
}

export const isUpdateMessage = (payload: object) => {
  const data = payload as any
  return data.entry[0].changes[0].value.statuses && data.entry[0].changes[0].value.statuses[0]
}

export const isIncomingMessage = (payload: object) => {
  return !isOutgoingMessage(payload)
}

export const extractTypeMessage = (payload: object) => {
  const data = payload as any
  return (
    (
      data?.entry
      && data.entry[0]
      && data.entry[0].changes
      && data.entry[0].changes[0]
      && data.entry[0].changes[0].value
    ) && (
      data.entry[0].changes[0].value.messages
      && data.entry[0].changes[0].value.messages[0]
      && data.entry[0].changes[0].value.messages[0].type
    )
  )
}

export const isAudioMessage = (payload: object) => {
  return 'audio' == extractTypeMessage(payload)
}


export const isFailedStatus = (payload: object) => {
  const data = payload as any
  return 'failed' == (data.entry[0].changes[0].value.statuses
                        && data.entry[0].changes[0].value.statuses[0]
                        && data.entry[0].changes[0].value.statuses[0].status)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const jidToPhoneNumber = (value: any, plus = '+', retry = true): string => {
  if (isLidUser(value) || isJidNewsletter(value)) {
    return value
  }
  const number = (value || '').split('@')[0].split(':')[0].replace('+', '')
  const country = number.substring(0, 2)
  if (country == '55') {
    const isValid = isValidPhoneNumber(`+${number}`, true)
    if (!isValid && number.length < 13 && retry) {
      const prefix = number.substring(2, 4)
      const m = number.match(/(\d{8})$/)
      const digits = m ? m[1] : number.slice(-8)
      const digit = '9'
      const out = `${plus}${country}${prefix}${digit}${digits}`.replace('+', '')
      return jidToPhoneNumber(`${plus}${out}`, plus, false)
    }
  }
  return `${plus}${number.replace('+', '')}`
}

export const jidToPhoneNumberIfUser = (value: any): string => {
  return isIndividualJid(value) ? jidToPhoneNumber(value, '') : value 
}

// Normaliza IDs para webhook mantendo grupos intactos e convertendo usuários para PN com regra BR do 9º dígito
// - Mantém '@g.us' sem alterações (group_id, group_picture, etc.)
// - Converte '@lid' -> PN JID e depois -> PN
// - Converte JID de usuário -> PN
// - Aplica 9º dígito no Brasil somente para PN de usuários (55 + DDD + 8 dígitos iniciando em [6-9])
export const normalizeUserOrGroupIdForWebhook = (value?: string): string => {
  const brMobile9 = (digits?: string) => {
    try {
      const s = `${digits || ''}`.replace(/\D/g, '')
      if (!s.startsWith('55')) return s
      if (s.length === 12) {
        const ddd = s.slice(2, 4)
        const local = s.slice(4)
        if (/[6-9]/.test(local[0])) return `55${ddd}9${local}`
      }
      return s
    } catch {
      return `${digits || ''}`
    }
  }
  try {
    let val = `${value || ''}`
    if (!val) return val
    // Não normalizar grupos
    if (val.includes('@g.us')) return val
    // Normalizar LID -> PN JID
    try {
      if (val.includes('@lid')) {
        val = jidNormalizedUser(val)
      }
    } catch {}
    // Converter JID de usuário para PN quando aplicável
    try {
      if (!/^\+?\d+$/.test(val)) {
        val = jidToPhoneNumberIfUser(val)
      }
    } catch {}
    // Garantir PN apenas dígitos e aplicar regra do 9º dígito BR
    try {
      const pn = ensurePn(val)
      if (pn) return brMobile9(pn)
    } catch {}
    return val
  } catch {
    return `${value || ''}`
  }
}

// Aplica normalização nos campos de IDs do payload Cloud API pronto para envio
// - contacts[*].wa_id
// - messages[*].from
// - statuses[*].recipient_id
export const normalizeWebhookValueIds = (cloudValue: any): void => {
  try {
    const v: any = cloudValue || {}
    if (Array.isArray(v.contacts)) {
      for (const c of v.contacts) {
        if (c && typeof c.wa_id === 'string') c.wa_id = normalizeUserOrGroupIdForWebhook(c.wa_id)
      }
    }
    if (Array.isArray(v.messages)) {
      for (const m of v.messages) {
        if (m && typeof m.from === 'string') m.from = normalizeUserOrGroupIdForWebhook(m.from)
      }
    }
    if (Array.isArray(v.statuses)) {
      for (const s of v.statuses) {
        if (s && typeof s.recipient_id === 'string') s.recipient_id = normalizeUserOrGroupIdForWebhook(s.recipient_id)
      }
    }
  } catch {}
}

/*
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WHATSAPP-BUSINESS-ACCOUNT-ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "PHONE-NUMBER",
          "phone_number_id": "PHONE-NUMBER-ID"
        },
      # Additional arrays and objects
        "contacts": [{...}]
        "errors": [{...}]
        "messages": [{...}]
        "statuses": [{...}]
      },
      "field": "messages"

    }]
  }]
}

{
  "key": {
   "remoteJid": "554999379224@s.whatsapp.net",
   "fromMe": true,
   "id": "BAE55FF6705AD8DD"
  },
  "update": {
   "status": 0,
   "messageStubParameters": [
    "405"
   ]
  }
 }
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fromBaileysMessageContent = (phone: string, payload: any, config?: Partial<Config>): [any, string, string] => {
  try {
    const { key: { id: whatsappMessageId, fromMe } } = payload
    const [chatJid, senderPhone, senderId] = getChatAndNumberAndId(payload)
    const messageType = getMessageType(payload)
    // Device-sent messages (from the phone) may arrive under messages.update with message content.
    // Unwrap to a plain message payload and DROP the update field to avoid recursion.
    const innerUpdateMsg = payload?.update?.message?.deviceSentMessage?.message || payload?.update?.message
    if (innerUpdateMsg) {
      const keys = Object.keys(innerUpdateMsg || {})
      const hasReadable = keys.find((k) => TYPE_MESSAGES_TO_READ.includes(k))
      if (hasReadable) {
        const { update: _omit, ...rest } = payload
        const changedPayload = { ...rest, message: innerUpdateMsg }
        return fromBaileysMessageContent(phone, changedPayload, config)
      }
    }
    // Also unwrap editedMessage wrappers into their inner original message content
    let innerEditedMsg = payload?.message?.editedMessage?.message || payload?.message?.protocolMessage?.editedMessage?.message
    if (innerEditedMsg) {
      // If inner edited content is a media without url but with caption, convert to text(conversation: caption)
      try {
        const tmp: any = { message: innerEditedMsg }
        const t = getMessageType(tmp)
        const b = getBinMessage(tmp as any)
        if (t && TYPE_MESSAGES_TO_PROCESS_FILE.includes(t) && !b?.message?.url && b?.message?.caption) {
          innerEditedMsg = { conversation: b.message.caption } as any
        } else if (['viewOnceMessage','viewOnceMessageV2','viewOnceMessageV2Extension','documentWithCaptionMessage'].includes(`${t}`)) {
          const inner = (b as any)?.message?.message || (b as any)?.message
          if (inner && typeof inner === 'object') {
            const keys = Object.keys(inner || {})
            const innerType = keys.find((k) => TYPE_MESSAGES_TO_PROCESS_FILE.includes(k))
            if (innerType) {
              const innerMsg = (inner as any)[innerType]
              if (innerMsg && !innerMsg.url && innerMsg.caption) {
                innerEditedMsg = { conversation: innerMsg.caption } as any
              }
            }
          }
        } else if (`${t}` === 'protocolMessage') {
          const em = (b as any)?.message?.editedMessage
          if (em && typeof em === 'object') {
            const keys = Object.keys(em || {})
            const mkey = keys.find((k) => TYPE_MESSAGES_TO_PROCESS_FILE.includes(k))
            if (mkey) {
              const innerMsg = (em as any)[mkey]
              if (innerMsg && !innerMsg.url && innerMsg.caption) {
                innerEditedMsg = { conversation: innerMsg.caption } as any
              }
            }
          }
        }
      } catch {}
      const { update: _omitEdit, ...restEdit } = payload || {}
      const changedPayload = { ...restEdit, message: innerEditedMsg }
      return fromBaileysMessageContent(phone, changedPayload, config)
    }
    const binMessage = payload.update || payload.receipt || (messageType && payload.message && payload.message[messageType])
    let profileName
    if (fromMe) {
      profileName = senderPhone
    } else {
      profileName = payload.verifiedBizName || payload.pushName || senderPhone
    }
    let cloudApiStatus
    let messageTimestamp = payload.messageTimestamp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groupMetadata: any = {}
    if (payload.groupMetadata) {
      groupMetadata.group_subject = payload.groupMetadata.subject
      groupMetadata.group_id = chatJid
      groupMetadata.group_picture = payload.groupMetadata.profilePicture
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statuses: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errors: any[] = []
    const change = {
      value: {
        messaging_product: 'whatsapp',
        metadata: {
          display_phone_number: phone,
          phone_number_id: phone,
        },
        messages,
        contacts: [
          {
            profile: (
              () => {
                // Em eventos de status (update/receipt), não incluir picture
                // Em novos messages, manter picture (mesmo undefined) para compatibilidade dos testes
                const p: any = { name: profileName }
                const mt = `${messageType || ''}`
                if (!['update', 'receipt'].includes(mt)) {
                  // manter a chave 'picture' (pode ser undefined) nos eventos de mensagem
                  p.picture = payload.profilePicture
                }
                return p
              }
            )(),
            ...groupMetadata,
            wa_id: (
              // 1) outro lado (derivado do remoteJid já normalizado)
              ensurePn(senderPhone) ||
              // 2) alternativas explícitas quando presentes
              ensurePn(payload?.key?.participantPn) ||
              ensurePn(payload?.participantPn) ||
              ensurePn(payload?.key?.senderPn) ||
              // 3) fallbacks a partir de JIDs brutos
              ensurePn(senderId) ||
              ensurePn(payload?.key?.remoteJid) ||
              ensurePn(payload?.key?.remoteJidAlt) ||
              ensurePn(payload?.key?.participantAlt) ||
              ensurePn(payload?.participantAlt)
            ) || (payload?.key?.participant || payload?.key?.remoteJid || senderId),
          },
        ],
        statuses,
        errors,
      },
      field: 'messages',
    }
  const data = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: phone,
          changes: [change],
        },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message: any = {
      from: (fromMe
        ? phone.replace('+', '')
        : (
            ensurePn((payload as any)?.key?.senderPn) ||
            ensurePn((payload as any)?.key?.participantPn) ||
            ensurePn(senderPhone) ||
            ensurePn(senderId) ||
            senderId
          )
      ),
      id: whatsappMessageId,
    }
    if (payload.messageTimestamp) {
      message['timestamp'] = payload.messageTimestamp.toString()
    }
    switch (messageType) {
      case 'imageMessage':
      case 'videoMessage':
      case 'audioMessage':
      case 'stickerMessage':
      case 'documentMessage':
      case 'ptvMessage':
        let mediaType = messageType.replace('Message', '')
        const mediaKey = `${phone}/${whatsappMessageId}`
        // Be defensive: edited/device-sent updates may omit mimetype/url
        const rawMime = ((binMessage && (binMessage as any).fileName) && (mime.lookup((binMessage as any).fileName) as string))
                      || (binMessage && (binMessage as any).mimetype) || ''
        const mimetype = (rawMime && rawMime.split(';')[0]) || 'application/octet-stream'
        const extension = (mime.extension(mimetype) || 'bin') as string
        const filename = (binMessage && (binMessage as any).fileName) || `${whatsappMessageId}.${extension}`
        if (mediaType == 'pvt') {
          mediaType = mimetype.split('/')[0]
        }
        message[mediaType] = { 
          caption: binMessage.caption,
          filename,
          mime_type: mimetype,
          sha256: binMessage.fileSha256,
          // url: binMessage.url && binMessage.url.indexOf('base64') < 0 ? binMessage.url : '',
          id: mediaKey,
        }
        message.type = mediaType
        break

      case 'contactMessage':
      case 'contactsArrayMessage':
        // {"key":{"remoteJid":"554988290955@s.whatsapp.net","fromMe":false,"id":"3EB03CDCC2A5D40DEFED"},"messageTimestamp":1676629371,"pushName":"Clairton Rodrigo Heinzen","message":{"contactsArrayMessage":{"contacts":[{"displayName":"Adapta","vcard":"BEGIN:VCARD\nVERSION:3.0\nN:;Adapta;;;\nFN:Adapta\nTEL;type=CELL;waid=554988333030:+55 49 8833-3030\nEND:VCARD"},{"displayName":"Silvia Castagna Heinzen","vcard":"BEGIN:VCARD\nVERSION:3.0\nN:Castagna Heinzen;Silvia;;;\nFN:Silvia Castagna Heinzen\nTEL;type=CELL;waid=554999621461:+55 49 9962-1461\nEND:VCARD"}],"contextInfo":{"disappearingMode":{"initiator":"CHANGED_IN_CHAT"}}},"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"DSu3J5WUK+vicA==","senderTimestamp":"1676571145","recipientKeyHash":"tz8qTGvqyPjOUw==","recipientTimestamp":"1666725555"},"deviceListMetadataVersion":2}}}}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vcards = messageType == 'contactMessage' ? [binMessage.vcard] : binMessage.contacts.map((c: any) => c.vcard)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contacts: any[] = []
        for (let i = 0; i < vcards.length; i++) {
          const vcard = vcards[i]
          if (vcard) {
            const card: vCard = new vCard().parse(vcard.replace(/\r?\n/g, '\r\n'))
            const contact = {
              name: {
                formatted_name: card.get('fn').valueOf(),
              },
              phones: [
                {
                  phone: card.get('tel').valueOf(),
                },
              ],
            }
            contacts.push(contact)
          }
        }
        message.contacts = contacts
        message.type = 'contacts'
        break

      case 'editedMessage':
        // {"key":{"remoteJid":"120363193643042227@g.us","fromMe":false,"id":"3EB06C161FED2A9D63C767","participant":"554988290955@s.whatsapp.net"},"messageTimestamp":1698278099,"pushName":"Clairton Rodrigo Heinzen","broadcast":false,"message":{"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"ltZ5vMXiILth5A==","senderTimestamp":"1697942459","recipientKeyHash":"GVXxipL53tKc2g==","recipientTimestamp":"1697053156"},"deviceListMetadataVersion":2},"editedMessage":{"message":{"protocolMessage":{"key":{"remoteJid":"120363193643042227@g.us","fromMe":true,"id":"3EB03E16AD6F36BFCDD9F5","participant":"554988290955@s.whatsapp.net"},"type":"MESSAGE_EDIT","editedMessage":{"conversation":"Kailaine, reagenda esse pacientes da dra Eloisa que estão em dias diferentes da terça e quinta\\nQuando tiver concluido me avisa para fechar a agendar, pois foi esquecido de fechar a agenda"},"timestampMs":"1698278096189"}}}}}
        // {"key":{"remoteJid":"X@s.whatsapp.net","fromMe":false,"id":"X"},"messageTimestamp":1742222988,"pushName":"X","message":{"editedMessage":{"message":{"conversation":"Bom dia, tudo bem?"}}},"verifiedBizName":"X"}
        const editedMessage = binMessage.message.protocolMessage ? binMessage.message.protocolMessage[messageType] : binMessage.message
        // Keep envelope key.id (Cloud API expects current event id), only replace message content
        const { update: _omitUpdate1, ...restEdited } = payload || {}
        const editedMessagePayload: any = { ...restEdited, message: editedMessage }
        const editedMessageType = getMessageType(editedMessagePayload)
        const editedBinMessage = getBinMessage(editedMessagePayload)
        if (editedMessageType && TYPE_MESSAGES_TO_PROCESS_FILE.includes(editedMessageType) && !editedBinMessage?.message?.url && editedBinMessage?.message?.caption) {
          editedMessagePayload.message = { conversation: editedBinMessage?.message?.caption }
        } else if (['viewOnceMessage','viewOnceMessageV2','viewOnceMessageV2Extension','documentWithCaptionMessage'].includes(`${editedMessageType}`)) {
          const inner = (editedBinMessage as any)?.message?.message || (editedBinMessage as any)?.message
          if (inner && typeof inner === 'object') {
            const keys = Object.keys(inner || {})
            const innerType = keys.find((k) => TYPE_MESSAGES_TO_PROCESS_FILE.includes(k))
            if (innerType) {
              const innerMsg = (inner as any)[innerType]
              if (innerMsg && !innerMsg.url && innerMsg.caption) {
                editedMessagePayload.message = { conversation: innerMsg.caption }
              }
            }
          }
        }
        return fromBaileysMessageContent(phone, editedMessagePayload, config)

      
      case 'protocolMessage':
        // {"key":{"remoteJid":"351912490567@s.whatsapp.net","fromMe":false,"id":"3EB0C77FBE5C8DACBEC5"},"messageTimestamp":1741714271,"pushName":"Pedro Paiva","broadcast":false,"message":{"protocolMessage":{"key":{"remoteJid":"351211450051@s.whatsapp.net","fromMe":true,"id":"3EB05C0B7B1A0C12284EE0"},"type":"MESSAGE_EDIT","editedMessage":{"conversation":"blablabla2","messageContextInfo":{"messageSecret":"4RYW9eIV1O4j5vjNmY059bZRymJ+B2aTfi9it9+2RxA="}},"timestampMs":"1741714271693"},"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"UgdPt0CEKvqhyg==","senderTimestamp":"1741018303","senderAccountType":"E2EE","receiverAccountType":"E2EE","recipientKeyHash":"EhuHta8R2tH+8g==","recipientTimestamp":"1740522549"},"deviceListMetadataVersion":2,"messageSecret":"4RYW9eIV1O4j5vjNmY059bZRymJ+B2aTfi9it9+2RxA="}}}
        if (binMessage.editedMessage) {
          // Unwrap into the inner edited content and drop any update field to avoid recursion
          let inner = (binMessage.editedMessage as any)?.message
            || ((binMessage.editedMessage as any)?.conversation ? { conversation: (binMessage.editedMessage as any).conversation } : undefined)
            || (binMessage.editedMessage as any)
          try {
            if (inner && typeof inner === 'object') {
              const keys = Object.keys(inner || {})
              const innerType = keys.find((k) => TYPE_MESSAGES_TO_PROCESS_FILE.includes(k))
              if (innerType) {
                const innerMsg = (inner as any)[innerType]
                if (innerMsg && !innerMsg.url && innerMsg.caption) {
                  inner = { conversation: innerMsg.caption } as any
                }
              }
            }
          } catch {}
          const { update: _omitUpdate2, ...restProto } = payload || {}
          return fromBaileysMessageContent(phone, { ...restProto, message: inner }, config)
        } else {
          logger.debug(`Ignore message type ${messageType}`)
          return [null, senderPhone, senderId]
        }

      case 'ephemeralMessage':
      case 'viewOnceMessage':
      case 'viewOnceMessageV2':
      // {"key":{"remoteJid":"554891710539@s.whatsapp.net","fromMe":false,"id":"3EB016D7881A2C29E25378"},"messageTimestamp":1704301811,"pushName":"Rodrigo","broadcast":false,"message":{"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"n3DiVMM5RFh8Cg==","senderTimestamp":"1703800265","recipientKeyHash":"5IqwqCOTqgXgCA==","recipientTimestamp":"1704205568"},"deviceListMetadataVersion":2},"documentWithCaptionMessage":{"message":{"documentMessage":{"url":"https://mmg.whatsapp.net/v/t62.7119-24/24248058_881769707068106_5138895532383847851_n.enc?ccb=11-4&oh=01_AdQM6YlfR3dW_UvRoLmPQeqOl08pdn8DNtTCTP1DMz4gcA&oe=65BCEDEA&_nc_sid=5e03e0&mms3=true","mimetype":"text/csv","title":"Clientes-03-01-2024-11-38-32.csv","fileSha256":"dmBD4FB1aoDA9fnIRXbvqgExKmxqK6qjGFIGETMmH4Y=","fileLength":"266154","mediaKey":"Mmu+1SthUQuVn8JM+W1Uwttkb3Vo/VQlSJQd/ddNixU=","fileName":"Clientes-03-01-2024-11-38-32.csv","fileEncSha256":"+EadJ+TTn43nOvcccdXAdHSYt9KQy+R7lcsmwkotQnY=","directPath":"/v/t62.7119-24/24248058_881769707068106_5138895532383847851_n.enc?ccb=11-4&oh=01_AdQM6YlfR3dW_UvRoLmPQeqOl08pdn8DNtTCTP1DMz4gcA&oe=65BCEDEA&_nc_sid=5e03e0","mediaKeyTimestamp":"1704301417","contactVcard":false,"contextInfo":{"ephemeralSettingTimestamp":"1702988379","disappearingMode":{"initiator":"CHANGED_IN_CHAT"}},"caption":"pode subir essa campanha por favor"}}}}}
      case 'documentWithCaptionMessage':
      // {"key":{"remoteJid":"554988290955@s.whatsapp.net","fromMe":false,"id":"3A3BD07D3529A482876A"},"messageTimestamp":1726448401,"pushName":"Clairton Rodrigo Heinzen","broadcast":false,"message":{"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"FxWbzja6L9qr6A==","senderTimestamp":"1725477022","recipientKeyHash":"HDhq+OTRdd9hhg==","recipientTimestamp":"1725986929"},"deviceListMetadataVersion":2},"viewOnceMessageV2Extension":{"message":{"audioMessage":{"url":"https://mmg.whatsapp.net/v/t62.7117-24/26550443_409309922183140_5545513783776136395_n.enc?ccb=11-4&oh=01_Q5AaIFdNmgUqP86I5VM6WLnt4i1h6wxOoPGY2kvj7wQlhE4c&oe=670EF9DE&_nc_sid=5e03e0&mms3=true","mimetype":"audio/ogg; codecs=opus","fileSha256":"kIFwwAF/PlmPp/Lxy2lVKgt8aq+fzSe+XmRwT5/Cn5A=","fileLength":"11339","seconds":8,"ptt":true,"mediaKey":"MEOnPR/10pkdQhNjjoB1yJXOZ/x9XAJk0m1XI1g7tdM=","fileEncSha256":"ZS1J1Zkjd93jz8TVg9rlNSotMCVbbZyBR/lOIwQhkSI=","directPath":"/v/t62.7117-24/26550443_409309922183140_5545513783776136395_n.enc?ccb=11-4&oh=01_Q5AaIFdNmgUqP86I5VM6WLnt4i1h6wxOoPGY2kvj7wQlhE4c&oe=670EF9DE&_nc_sid=5e03e0","mediaKeyTimestamp":"1726448391","streamingSidecar":"hRM//de8KSrVng==","waveform":"AAYEAgEBAQMGFxscHBQkJBscIyMcHBUPCQQCAQEAAAEPIRwkHhgXGBQJBAIBAAAAAAAAAAAAAAAAAAAAAAAAAA==","viewOnce":true}}}}}
      case 'viewOnceMessageV2Extension': {
        // If inner content is media missing url but with caption, convert to text before unwrap
        let nextMessage: any = binMessage.message
        try {
          const inner = (binMessage as any)?.message?.message || (binMessage as any)?.message
          if (inner && typeof inner === 'object') {
            const keys = Object.keys(inner || {})
            const innerType = keys.find((k) => TYPE_MESSAGES_TO_PROCESS_FILE.includes(k))
            if (innerType) {
              const innerMsg = (inner as any)[innerType]
              if (innerMsg && !innerMsg.url && innerMsg.caption) {
                nextMessage = { conversation: innerMsg.caption }
              }
            }
          }
        } catch {}
        const changedPayload = {
          ...(payload ? (({ update: _omitUpdate3, ...r }) => r)(payload) : payload),
          message: nextMessage,
        }
        return fromBaileysMessageContent(phone, changedPayload, config)
      }

      case 'messageStubType': {
        const isDecryptStub =
          (payload as any)?.messageStubType === 2 &&
          (payload as any)?.messageStubParameters &&
          (payload as any)?.messageStubParameters[0] &&
          MESSAGE_STUB_TYPE_ERRORS.includes(
            String((payload as any).messageStubParameters[0]).toLowerCase(),
          )
        // If decrypt failure for incoming msg: ignore stub and wait for media retry delivery
        if (isDecryptStub && !(payload as any)?.key?.fromMe) {
          logger.debug('Decrypt stub received (will wait for media retry): %s', JSON.stringify(payload?.messageStubParameters))
          return [null, senderPhone, senderId]
        }
        return [null, senderPhone, senderId]
      }

      case 'conversation':
      case 'extendedTextMessage':
        {
          // Build text body and normalize @mentions to preferred alias
          const raw = (binMessage?.text || binMessage) as string
          const ctx: any = (binMessage as any)?.contextInfo || {}
          const nameMap: Record<string, string> = ((payload as any)?.groupMetadata?.names || (payload as any)?.contactNames || {}) as any
          const mentioned: string[] = Array.isArray(ctx?.mentionedJid) ? ctx.mentionedJid : []
          const toPn = (jid: string) => {
            try {
              if (isLidUser(jid)) {
                return jidToPhoneNumber(jidNormalizedUser(jid), '').replace('+', '')
              } else {
                return jidToPhoneNumber(jid, '').replace('+', '')
              }
            } catch {
              return ''
            }
          }
          let body = `${raw || ''}`
          try {
            if (mentioned.length && body) {
              for (const mj of mentioned) {
                const lidDigits = `${mj}`.split('@')[0]
                const pnDigits = toPn(mj)
                // Prefer contactName > PN > LID digits
                let alias = pnDigits || lidDigits
                try {
                  const normalizedPnJid = (isLidUser(mj) ? jidNormalizedUser(mj) : mj) as any
                  const contactName = (nameMap && (nameMap[mj] || nameMap[normalizedPnJid] || (pnDigits ? nameMap[`${pnDigits}@s.whatsapp.net`] : undefined))) as string | undefined
                  if (contactName && contactName.trim()) alias = contactName.trim()
                } catch {}
                if (alias) {
                  const patterns = new Set<string>()
                  if (lidDigits) patterns.add(lidDigits)
                  if (pnDigits) patterns.add(pnDigits)
                  for (const d of patterns) {
                    if (!d) continue
                    // replace all occurrences of @<digits>
                    const re = new RegExp(`@${d}\b`, 'g')
                    body = body.replace(re, `@${alias}`)
                  }
                }
              }
            }
          } catch {}
          try { logger.debug('MENTION normalized: "%s" -> "%s"', raw || '', body || '') } catch {}
          message.text = { body }
        }
        message.type = 'text'
        break

      case 'reactionMessage':
        // {"key":{"remoteJid":"554988290955@s.whatsapp.net","fromMe":false,"id":"3ABBD003E80C199C7BF6"},"messageTimestamp":1676631873,"pushName":"Clairton Rodrigo Heinzen","message":{"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"31S8mj42p3wLiQ==","senderTimestamp":"1676571145","recipientKeyHash":"tz8qTGvqyPjOUw==","recipientTimestamp":"1675040504"},"deviceListMetadataVersion":2},"reactionMessage":{"key":{"remoteJid":"554988290955@s.whatsapp.net","fromMe":false,"id":"3A51A48E269AFFF123FB"},"text":"👍","senderTimestampMs":"1676631872443"}}
        const reactionId = binMessage.key.id
        if (config?.sendReactionAsReply) {
          message.text = {
            body: binMessage.text,
          }
          message.type = 'text'
          message.context = {
            message_id: reactionId,
            id: reactionId,
          }
        } else {
          message.reaction = {
            message_id: reactionId,
            emoji: binMessage.text,
          }
          message.type = 'reaction'
        }
        break

      case 'locationMessage':
      case 'liveLocationMessage':
        const { degreesLatitude, degreesLongitude } = binMessage
        // {"key":{"remoteJid":"554988290955@s.whatsapp.net","fromMe":false,"id":"3AC859A3C2069CD40799"},"messageTimestamp":1676629467,"pushName":"Clairton Rodrigo Heinzen","message":{"locationMessage":{"degreesLatitude":-26.973182678222656,"degreesLongitude":-52.523704528808594,"jpegThumbnail":"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"},"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"31S8mj42p3wLiQ==","senderTimestamp":"1676571145","recipientKeyHash":"tz8qTGvqyPjOUw==","recipientTimestamp":"1675040504"}
        message.location = {
          latitude: degreesLatitude,
          longitude: degreesLongitude,
        }
        message.type = 'location'
        break

      case 'receipt':
        const {
          receipt: { receiptTimestamp, readTimestamp },
        } = payload
        if (readTimestamp) {
          cloudApiStatus = 'read'
          messageTimestamp = readTimestamp
        } else if (receiptTimestamp) {
          cloudApiStatus = 'delivered'
          messageTimestamp = receiptTimestamp
        }
        break

      case 'messageStubType':
        MESSAGE_STUB_TYPE_ERRORS
        if (payload.messageStubType == 2 && 
            payload.messageStubParameters &&
            payload.messageStubParameters[0] &&
            MESSAGE_STUB_TYPE_ERRORS.includes(payload.messageStubParameters[0].toLowerCase())) {
          message.text = {
            body: MESSAGE_CHECK_WAAPP || t('failed_decrypt'),
          }
          message.type = 'text'
          change.value.messages.push(message)
          throw new DecryptError(data)
        } else {
          return [null, senderPhone, senderId]
        }

      case 'update':
        const baileysStatus = payload.status || payload.update.status
        if (!baileysStatus && payload.update.status != 0 && !payload?.update?.messageStubType && !payload?.update?.starred) {
          return [null, senderPhone, senderId]
        }
        switch (baileysStatus) {
          case 0:
          case '0':
          case 'ERROR':
            cloudApiStatus = 'failed'
            break

          case 1:
          case '1':
          case 'PENDING':
            cloudApiStatus = 'sent'
            break

          case 2:
          case '2':
          case 'SERVER_ACK':
            cloudApiStatus = 'sent'
            break

          case 3:
          case '3':
          case 'DELIVERY_ACK':
            cloudApiStatus = 'delivered'
            break

          case 4:
          case '4':
          case 'READ':
          case 5:
          case '5':
          case 'PLAYED':
            cloudApiStatus = 'read'
            break

          case 'DELETED':
            cloudApiStatus = 'deleted'
            break

          default:
            if (payload.update && payload.update.messageStubType && payload.update.messageStubType == 1) {
              cloudApiStatus = 'deleted'
            } else if (payload?.update?.starred) {
              // starred in unknown, but if is starred the userd read the message
              cloudApiStatus = 'read'
            } else {
              cloudApiStatus = 'failed'
              payload = {
                update: {
                  error: 4,
                  title: `Unknown baileys status type ${baileysStatus}`,
                },
              }
            }
        }
        break
      case 'listResponseMessage':
        message.text = {
          body: payload.message.listResponseMessage.title,
        }
        message.type = 'text'
        break

      case 'statusMentionMessage':
        break

      case 'messageContextInfo':
      case 'senderKeyDistributionMessage':
      case 'albumMessage':
      case 'keepInChatMessage':
        logger.debug(`Ignore message type ${messageType}`)
        return [null, senderPhone, senderId]

      default:
        cloudApiStatus = 'failed'
        payload = {
          update: {
            error: 4,
            title: `Unknown baileys message type ${messageType}`,
          },
        }
    }
    // const repository = await getRepository(this.phone, this.config)
    if (cloudApiStatus) {
      const messageId = whatsappMessageId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let recipientPn = (
        // 1) outro lado (preferência absoluta)
        ensurePn(senderPhone) ||
        // 2) alternativas explícitas
        ensurePn((payload as any)?.key?.participantPn) ||
        ensurePn((payload as any)?.participantPn) ||
        ensurePn((payload as any)?.key?.senderPn) ||
        // 3) fallbacks a partir de JIDs brutos
        ensurePn(senderId) ||
        ensurePn((payload as any)?.key?.remoteJid) ||
        ensurePn((payload as any)?.key?.remoteJidAlt) ||
        ensurePn((payload as any)?.key?.participantAlt) ||
        ensurePn((payload as any)?.participantAlt) ||
        ''
      )
      const state: any = {
        conversation: {
          // Mantém compatibilidade: usar o JID da conversa (ex.: +1111@s.whatsapp.net)
          id: chatJid,
          // expiration_timestamp: new Date().setDate(new Date().getDate() + 30),
        },
        id: messageId,
        recipient_id: recipientPn || senderId,
        status: cloudApiStatus,
      }
      // Defensivo: se recipient_id ficou vazio ou igual ao número do próprio canal,
      // force usar o PN do outro lado (senderPhone derivado do remoteJid)
      try {
        const channelPn = `${phone}`.replace('+', '')
        const otherSide = ensurePn(senderPhone)
        if (!state.recipient_id || `${state.recipient_id}` === channelPn) {
          if (otherSide) state.recipient_id = otherSide
        }
      } catch {}
      // Preencher timestamp do status (Cloud API espera esse campo). Usar em ordem:
      // 1) messageTimestamp calculado a partir de receipt/read
      // 2) payload.messageTimestamp, se existir
      try {
        if (messageTimestamp) {
          state['timestamp'] = `${messageTimestamp}`
        } else if (payload.messageTimestamp) {
          state['timestamp'] = payload.messageTimestamp.toString()
        }
      } catch {}
      if (cloudApiStatus == 'failed') {
        // https://github.com/tawn33y/whatsapp-cloud-api/issues/40#issuecomment-1290036629
        let title = payload?.update?.title || 'The Unoapi Cloud has a error, verify the logs'
        let code = payload?.update?.code || 1
        if (payload?.update?.messageStubParameters == '405') {
          title = 'message not allowed'
          code = 8
        }
        const error = {
          code,
          title,
        }
        state.errors = [error]
      }
      change.value.statuses.push(state)
      try {
        logger.info('STATUS map: id=%s to recipient_id=%s status=%s', messageId || '<none>', state.recipient_id || '<none>', cloudApiStatus || '<none>')
      } catch {}
    } else {
      // {"key":{"remoteJid":"554988290955@s.whatsapp.net","fromMe":false,"id":"3A4F0B7A946F046A1AD0"},"messageTimestamp":1676632069,"pushName":"Clairton Rodrigo Heinzen","message":{"extendedTextMessage":{"text":"Isso","contextInfo":{"stanzaId":"BAE50C61B223F799","participant":"554998360838@s.whatsapp.net","quotedMessage":{"conversation":"*Odonto Excellence*: teste"}}},"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"31S8mj42p3wLiQ==","senderTimestamp":"1676571145","recipientKeyHash":"tz8qTGvqyPjOUw==","recipientTimestamp":"1675040504"},"deviceListMetadataVersion":2}}}
      const stanzaId = binMessage?.contextInfo?.stanzaId
      if (stanzaId) {
        message.context = {
          message_id: stanzaId,
          id: stanzaId,
        }
      }

      // {"key":{"remoteJid":"554936213177@s.whatsapp.net","fromMe":false,"id":"1EBD1D8356472403AFE7102D05D6B21B"},"messageTimestamp":1698057926,"pushName":"Odonto Excellence","broadcast":false,"message":{"extendedTextMessage":{"text":"https://fb.me/4QHYHT0Fv","matchedText":"https://fb.me/4QHYHT0Fv","previewType":"NONE","contextInfo":{"forwardingScore":1,"isForwarded":true,"externalAdReply":{"title":"Converse conosco!","body":"🤩 PRÓTESE FLEXÍVEL: VOCÊ JÁ CONHECE? 🤩\\n\\n✅ Maior Conforto\\n✅ Mais Natural\\n✅ Mais Bonita\\n✅ Sem Grampos Aparentes\\n\\nEstes são os benefícios que a PRÓTESE FLEXÍVEL pode te proporcionar. Tenha a sua LIBERDADE de volta, e volte a sorrir e a comer com tranquilidade!!! 🍎🌽🥩🍗\\n\\n⭐ ESSA É SUA CHANCE, NÃO DEIXE PASSAR!\\n\\n📲 Garanta sua avaliação e vamos falar a respeito dessa possibilidade de TRANSFORMAÇÃO!! 💖","mediaType":"VIDEO","thumbnailUrl":"https://scontent.xx.fbcdn.net/v/t15.5256-10/341500845_517424053756219_5530967817243282036_n.jpg?stp=dst-jpg_s851x315&_nc_cat=105&ccb=1-7&_nc_sid=0808e3&_nc_ohc=K-u3hFrS1xcAX-NaRwd&_nc_ad=z-m&_nc_cid=0&_nc_ht=scontent.xx&oh=00_AfDNIQXVcym0OF49i-UJSEX0rri9IlrwXPQkcXOpTfH-xQ&oe=653A3E2F","mediaUrl":"https://www.facebook.com/OdontoExcellenceSaoMiguel/videos/179630185187923/","thumbnail":"/9j/4AAQSkZJRgABAQAAAQABAAD/7QCEUGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAGgcAigAYkZCTUQwYTAwMGE2YzAxMDAwMGQ5MDEwMDAwNzMwMjAwMDBiZDAyMDAwMGZkMDIwMDAwODMwMzAwMDAxZDA0MDAwMDU0MDQwMDAwOTYwNDAwMDBkYTA0MDAwMGQyMDUwMDAwAP/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/CABEIADIAMgMBIgACEQEDEQH/xAAaAAADAQEBAQAAAAAAAAAAAAAABAUGAwEC/8QAFwEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAB7LotYdhMZYrOdwuhecNATMOzmNYureQ4GdHHXONXmxwSJaaQdvKOdak0MuMJQExenyFK1ADneUCsEgM+v//EACAQAAICAgICAwAAAAAAAAAAAAECAAMEERMhBRIUIjH/2gAIAQEAAQUC3031hfqx9ytG4iZuLb3vrgdyfGXNER6i+IjThSFwRh07WnWlEyKxbXe5xLPnLFb2lFjTfEj5Lqfn9M9OSp8RVvFx/vlXqinyF5OJkKQ11Ix7by7aee6CWqjwr6u4BRVIHIQeZo37L+pV+CZQHpP/xAAgEQACAQMEAwAAAAAAAAAAAAAAAgEDEjEQERMhMkFR/9oACAEDAQE/AWSGOOFzJUT3BaIkxgslsCq6FwsRBU2iOhdvp1pXwU/LT//EAB0RAAICAQUAAAAAAAAAAAAAAAABEBEhAgMSMUH/2gAIAQIBAT8BTGxZUbjvoWkqizj6VkRcuP/EACQQAAEDAwQCAwEAAAAAAAAAAAEAAhEDECESMUFRImEEIDKB/9oACAEBAAY/Ar+1J3F828RKa4aRHBUVGwpavysoPdJnhYs5pxPK01P4e1vZjGtwhjJUNXk2UW1WYPaxUcpcITG03eY64TdWw6CfU+Q4NKjVJ9IFohb24atMyjnKww/UQhaYzb//xAAfEAEAAwEAAgMBAQAAAAAAAAABABEhMWFxQVGRoRD/2gAIAQEAAT8hqsZpCOo1gfCKSW36f7RQYbuVXsGLPSbTxVksdfnjOxb/ACFWm/UxiC46BchpDwjVaM43GfSWyx9cNsBitlCoVAsKMtA9Uv1UEYf4ngAkKSM+DJsWuAza92sGRD8NFxGszcyE+XkXYp8sUbp+T25b0eScE8oBYH1OPB8jMi309ngYoOzZ4fE3d9TmUFGu1Byf/9oADAMBAAIAAwAAABCpUH4aO33xxv8AdjiD/8QAGhEBAQEBAQEBAAAAAAAAAAAAAQARMSEQcf/aAAgBAwEBPxATSPdACcX511eQmAIml+bAHhLEM2x9NWQ5crh8/8QAGhEBAQEAAwEAAAAAAAAAAAAAAQARECExQf/aAAgBAgEBPxBTpgSHlZMcjZCWlidvac6tHvEvt44//8QAIhABAAICAwEAAQUAAAAAAAAAAQARITFBUXFhkaGxwdHh/9oACAEBAAE/ELgC6IhR1ESCHFWGi8xRFxrP+D+8pJeObUEMSiHbfsaiXJlL/JU8W88CEAakQX4OmXygd1e0CCqM/UPBXx8gSHoA49g3iVFEDuzfdRK6UiCvhPGBDJqBi+feyWmG+okWXwHcu5BhA0ZqIF5VuouFW0XqUB/Vg/2Ic4Sw7B4bMj9Imnqgujq3c1ClB+sMFSoUAVS6v5Cs1Vazt3fkU1aHEUweytNAnJsrfVzTNey/SIkytuMRZpdEXSy4G4qghkGk4hVrKwtXryAQAbSymCI0jhCj+CI5KzdABLFtwWEULXJYQxAjl0wYr/MSmXU//9k=","sourceType":"ad","sourceId":"120200422938230365","sourceUrl":"https://fb.me/4QHYHT0Fv","containsAutoReply":false,"renderLargerThumbnail":true,"showAdAttribution":true,"ctwaClid":"ARA5EWTktP0VPr7ZyKkYKKQN_HfFye5re1giQ6os1ZjiFa0Pdftvs-ESdUtWgOjkEoBsJ_mCh86z8dBguiatoESpGwM"}},"inviteLinkGroupTypeV2":"DEFAULT"},"messageContextInfo":{"deviceListMetadata":{"senderKeyHash":"BmI9Pyppe2nL+A==","senderTimestamp":"1696945176","recipientKeyHash":"ltZ5vMXiILth5A==","recipientTimestamp":"1697942459"},"deviceListMetadataVersion":2}},"verifiedBizName":"Odonto Excellence"}
      const externalAdReply = binMessage?.contextInfo?.externalAdReply
      if (externalAdReply) {
        message.referral = {
          source_url: externalAdReply.sourceUrl,
          source_id: externalAdReply.sourceId,
          source_type: externalAdReply.sourceType,
          headline: externalAdReply.title,
          body: externalAdReply.body,
          media_type: externalAdReply.mediaType,
          image_url: externalAdReply.thumbnail,
          video_url: externalAdReply.mediaUrl,
          thumbnail_url: externalAdReply.thumbnailUrl,
          ctwa_clid: externalAdReply.ctwaClid,
        }

        if (message.type == 'text') {
          message.text.body = `${message.text.body}
            ${externalAdReply.title}

            ${externalAdReply.body}
          
            ${externalAdReply.mediaUrl || externalAdReply.thumbnailUrl}
          `
        }
      }
      change.value.messages.push(message)
    }
    // Log resumido de identificação (evita serializar WAProto inteiro)
    try {
      const contactWa = (data as any)?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id
      const msgFrom = (data as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const k: any = (payload as any)?.key || {}
      const logRemote = k?.remoteJid || (payload as any)?.remoteJid
      const logSenderPn = k?.senderPn || (payload as any)?.senderPn
      const logParticipantPn = k?.participantPn || (payload as any)?.participantPn
      logger.info('WEBHOOK ids: wa_id=%s from=%s remoteJid=%s senderPn=%s participantPn=%s', contactWa || '<none>', msgFrom || '<none>', logRemote || '<none>', logSenderPn || '<none>', logParticipantPn || '<none>')
    } catch {}
    logger.debug('fromBaileysMessageContent %s => %s', phone, JSON.stringify(data))
    return [data, senderPhone, senderId]
  } catch (e) {
    logger.error(e, 'Error on convert baileys to cloud-api')
    throw e
  }
}

export const toBuffer = (arrayBuffer) => {
  const buffer = Buffer.alloc(arrayBuffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  for (let i = 0; i < buffer.length; ++i) {
    buffer[i] = view[i];
  }
  return buffer;
}
