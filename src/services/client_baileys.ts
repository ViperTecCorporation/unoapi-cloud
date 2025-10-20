import { GroupMetadata, WAMessage, proto, delay, isJidGroup, jidNormalizedUser, AnyMessageContent, isLidUser, WAMessageAddressingMode } from '@whiskeysockets/baileys'
import fetch, { Response as FetchResponse } from 'node-fetch'
import { Listener } from './listener'
import { Store } from './store'
import {
  connect,
  sendMessage,
  readMessages,
  rejectCall,
  OnQrCode,
  OnNotification,
  OnNewLogin,
  fetchImageUrl,
  fetchGroupMetadata,
  exists,
  logout,
  close,
  OnReconnect,
} from './socket'
import { Client, getClient, clients, Contact } from './client'
import { Config, configs, defaultConfig, getConfig, getMessageMetadataDefault } from './config'
import { toBaileysMessageContent, phoneNumberToJid, jidToPhoneNumber, getMessageType, TYPE_MESSAGES_TO_READ, TYPE_MESSAGES_MEDIA } from './transformer'
import { v1 as uuid } from 'uuid'
import { Response } from './response'
import QRCode from 'qrcode'
import { Template } from './template'
import logger from './logger'
import { FETCH_TIMEOUT_MS, VALIDATE_MEDIA_LINK_BEFORE_SEND, CONVERT_AUDIO_MESSAGE_TO_OGG, HISTORY_MAX_AGE_DAYS, GROUP_SEND_MEMBERSHIP_CHECK, GROUP_SEND_ADDRESSING_MODE, GROUP_LARGE_THRESHOLD } from '../defaults'
import { convertToOggPtt } from '../utils/audio_convert'
import { t } from '../i18n'
import { ClientForward } from './client_forward'
import { SendError } from './send_error'

const attempts = 3

interface Delay {
  (phone: string, to: string): Promise<void>
}

const delays: Map<string, Map<string, Delay>> = new Map()

export const getClientBaileys: getClient = async ({
  phone,
  listener,
  getConfig,
  onNewLogin,
}: {
  phone: string
  listener: Listener
  getConfig: getConfig
  onNewLogin: OnNewLogin
}): Promise<Client> => {
  if (!clients.has(phone)) {
    logger.info('Creating client baileys %s', phone)
    const config = await getConfig(phone)
    let client
    if (config.connectionType == 'forward') {
      logger.info('Connecting client forward %s', phone)
      client = new ClientForward(phone, getConfig, listener)
    } else {
      logger.info('Connecting client baileys %s', phone)
      client = new ClientBaileys(phone, listener, getConfig, onNewLogin)
    }
    if (config.autoConnect) {
      logger.info('Connecting client %s', phone)
      await client.connect(1)
      logger.info('Created and connected client %s', phone)
    } else {
      logger.info('Config client to not auto connect %s', phone)
    }
    clients.set(phone, client)
  } else {
    logger.debug('Retrieving client baileys %s', phone)
  }
  return clients.get(phone) as Client
}

const sendError = new SendError(15, t('reloaded_session'))

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const readMessagesDefault: readMessages = async (_keys) => {
  throw sendError
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const rejectCallDefault: rejectCall = async (_keys) => {
  throw sendError
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fetchImageUrlDefault: fetchImageUrl = async (_jid: string) => ''

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fetchGroupMetadataDefault: fetchGroupMetadata = async (_jid: string) => {
  throw sendError
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const existsDefault: exists = async (_jid: string) => {
  throw sendError
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const logoutDefault: logout = async () => {}

const closeDefault = async () => logger.info(`Close connection`)

export class ClientBaileys implements Client {
  /**
   * High-level client that wraps Baileys send/receive operations for a single phone session.
   *
   * Responsibilities:
   * - Connect/disconnect lifecycle
   * - Map Cloud-API-like payloads to Baileys messages
   * - Apply sending safeguards (groups, status broadcast, media checks)
   * - Persist message keys/metadata to the configured Store
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readonly sendMessageDefault: sendMessage = async (_phone: string, _message: AnyMessageContent, _options: unknown) => {
    const sessionStore = this?.phone && await (await this?.config?.getStore(this.phone, this.config)).sessionStore
    if (sessionStore) {
      if (!await sessionStore.isStatusConnecting(this.phone)) {
        clients.delete(this.phone)
      }
      if (await sessionStore.isStatusOnline(this.phone)) {
        await sessionStore.setStatus(this.phone, 'offline')
        clients.delete(this.phone)
      }
    }
    throw sendError
  }

  private phone: string
  private config: Config = defaultConfig
  private close: close = closeDefault
  private sendMessage = this.sendMessageDefault
  private event
  private fetchImageUrl = fetchImageUrlDefault
  private exists = existsDefault
  private socketLogout: logout = logoutDefault
  private fetchGroupMetadata = fetchGroupMetadataDefault
  private readMessages = readMessagesDefault
  private rejectCall: rejectCall | undefined = rejectCallDefault
  private listener: Listener
  private store: Store | undefined
  private calls = new Map<string, boolean>()
  private getConfig: getConfig
  private onNewLogin

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onWebhookError = async (error: any) => {
    const { sessionStore } = this.store!
    if (!this.config.throwWebhookError && error.name === 'FetchError' && (await sessionStore.isStatusOnline(this.phone))) {
      return this.sendMessage(
        phoneNumberToJid(this.phone),
        { text: `Error on send message to webhook: ${error.message}`},
        {}
      )
    }
    if (this.config.throwWebhookError) {
      throw error
    }
  }

  private onNotification: OnNotification = async (text: string, important) => {
    if (this.config.sendConnectionStatus || important) {
      const id = uuid()
      const waMessageKey = {
        fromMe: true,
        remoteJid: phoneNumberToJid(this.phone),
        id,
      }
      const payload = {
        key: waMessageKey,
        message: {
          conversation: text,
        },
      }
      logger.debug('onNotification %s', JSON.stringify(payload))
      if (this.config.sessionWebhook) {
        try {
          const { sessionStore } = this.store!
          const body = JSON.stringify({ info: { phone: this.phone }, status: await sessionStore.getStatus(this.phone), ...payload })
          const response = await fetch(this.config.sessionWebhook, {
            method: 'POST',
            body: body,
            headers: { 'Content-Type': 'application/json' },
          })
          logger.debug('Response OnNotification Webhook Session', response)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          logger.error(error, 'Erro on send status')
          await this.onWebhookError(error)
        }
      } else {
        await this.listener.process(this.phone, [payload], 'status')
      }
    }
  }

  private onQrCode: OnQrCode = async (qrCode: string, time, limit) => {
    logger.debug('Received qrcode %s %s', this.phone, qrCode)
    const id = uuid()
    const qrCodeUrl = await QRCode.toDataURL(qrCode)
    const remoteJid = phoneNumberToJid(this.phone)
    const waMessageKey = {
      fromMe: true,
      remoteJid,
      id,
    }
    const message =  t('qrcode_attemps', time, limit)
    const waMessage: WAMessage = {
      key: waMessageKey,
      message: {
        imageMessage: {
          url: qrCodeUrl,
          mimetype: 'image/png',
          fileLength: qrCode.length,
          caption: message,
        },
      },
    }
    if (this.config.sessionWebhook) {
      const { sessionStore } = this.store!
      const body = JSON.stringify({ info: { phone: this.phone }, status: await sessionStore.getStatus(this.phone), ...waMessage })
      try {
        const response = await fetch(this.config.sessionWebhook, {
          method: 'POST',
          body: body,
          headers: { 'Content-Type': 'application/json' },
        })
        logger.debug('Response Webhook Session', response)
      } catch (error) {
        logger.error(error, 'Erro on send qrcode')
        await this.onWebhookError(error)
      }
    } else {
      await this.listener.process(this.phone, [waMessage], 'qrcode')
    }
  }

  private onReconnect: OnReconnect = async (time: number) => this.connect(time)

  private delayBeforeSecondMessage: Delay = async (phone, to) => {
    const time = 2000
    logger.debug(`Sleep for ${time} before second message ${phone} => ${to}`)
    delays && (delays.get(phone) || new Map()).set(to, this.continueAfterSecondMessage)
    return delay(time)
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  private continueAfterSecondMessage: Delay = async (_phone, _to) => {}

  constructor(phone: string, listener: Listener, getConfig: getConfig, onNewLogin: OnNewLogin) {
    this.phone = phone
    this.listener = listener
    this.getConfig = getConfig
    this.onNewLogin = onNewLogin
  }

  async connect(time: number) {
    logger.debug('Client Baileys connecting for %s', this.phone)
    this.config = await this.getConfig(this.phone)
    this.store = await this.config.getStore(this.phone, this.config)
    const { sessionStore } = this.store

    await sessionStore.syncConnection(this.phone)
    if (await sessionStore.isStatusConnecting(this.phone)) {
      logger.warn('Already Connecting %s', this.phone)
      return
    }
    if (await sessionStore.isStatusOnline(this.phone)) {
      logger.warn('Already Connected %s', this.phone)
      return
    }
    if (await sessionStore.isStatusStandBy(this.phone)) {
      logger.warn('Standby %s', this.phone)
      return
    }

    const result = await connect({
      phone: this.phone,
      store: this.store!,
      attempts,
      time,
      onQrCode: this.onQrCode,
      onNotification: this.onNotification,
      onNewLogin: this.onNewLogin,
      config: this.config,
      onDisconnected: async () => this.disconnect(),
      onReconnect: this.onReconnect
    })
    if (!result) {
      logger.error('Socket connect return empty %s', this.phone)
      return
    }
    const { send, read, event, rejectCall, fetchImageUrl, fetchGroupMetadata, exists, close, logout } = result
    this.event = event
    this.sendMessage = send
    this.readMessages = read
    this.rejectCall = rejectCall
    this.fetchImageUrl = this.config.sendProfilePicture ? fetchImageUrl : fetchImageUrlDefault
    this.fetchGroupMetadata = fetchGroupMetadata
    this.close = close
    this.exists = exists
    this.socketLogout = logout
    this.config.getMessageMetadata = async <T>(data: T) => {
      logger.debug(data, 'Put metadata in message')
      return this.getMessageMetadata(data)
    }
    await this.subscribe()
    logger.debug('Client Baileys connected for %s', this.phone)
  }

  async disconnect() {
    logger.debug('Disconnect client store for %s', this?.phone)
    this.store = undefined

    await this.close()
    clients.delete(this?.phone)
    configs.delete(this?.phone)
    this.sendMessage = this.sendMessageDefault
    this.readMessages = readMessagesDefault
    this.rejectCall = rejectCallDefault
    this.fetchImageUrl = fetchImageUrlDefault
    this.fetchGroupMetadata = fetchGroupMetadataDefault
    this.exists = existsDefault
    this.close = closeDefault
    this.config = defaultConfig
    this.socketLogout = logoutDefault
    this.config.getMessageMetadata = getMessageMetadataDefault
  }

  async subscribe() {
    this.event('messages.upsert', async (payload: { messages: any[]; type }) => {
      try {
        const arr: any[] = (payload?.messages || []) as any[]
        const cnt = arr.length
        const sample = arr.slice(0, 1).map((m) => ({ jid: m?.key?.remoteJid, id: m?.key?.id, type: Object.keys(m?.message || {})[0] }))
        logger.debug('messages.upsert %s count=%s sample=%s', this.phone, cnt, JSON.stringify(sample))
      } catch { logger.debug('messages.upsert %s', this.phone) }
      await this.listener.process(this.phone, payload.messages, payload.type)
      if (this.config.readOnReceipt && payload.messages[0] && !payload.messages[0]?.fromMe) {
        await Promise.all(
          payload.messages
            .filter((message: any) => {
              const messageType = getMessageType(message)
              return !message?.key?.fromMe && messageType && TYPE_MESSAGES_TO_READ.includes(messageType)
            })
            .map(async (message: any) => {
              return this.readMessages([message.key!])
            })
        )
      }
    })
    this.event('messages.update', async (messages: object[]) => {
      try {
        // Persist partial media updates to the DataStore so decrypt can pick improved keys/paths
        try {
          const store = this.store
          if (store && Array.isArray(messages)) {
            for (const m of messages as any[]) {
              const key = m?.key
              const update = m?.update
              if (key?.remoteJid && key?.id && update?.message) {
                try {
                  const existing = await store.dataStore.loadMessage(key.remoteJid, key.id)
                  const merged: any = existing ? { ...existing } : { key }
                  merged.message = { ...(existing?.message || {}), ...(update.message || {}) }
                  await store.dataStore.setMessage(key.remoteJid, merged)
                } catch (e) {
                  logger.warn(e as any, 'Ignore error merging messages.update into store')
                }
              }
            }
          }
        } catch (e) {
          logger.warn(e as any, 'Ignore error persisting messages.update')
        }
        // Detect server ack errors (e.g., 421) for group sends and log context
        const first = Array.isArray(messages) ? (messages[0] as any) : undefined
        const stubParams = first?.update?.messageStubParameters
        const key = first?.key
        if (stubParams && Array.isArray(stubParams) && stubParams.includes('421') && key?.remoteJid?.endsWith?.('@g.us')) {
          logger.warn('Server ack 421 for group %s message %s (fromMe: %s)', key?.remoteJid, key?.id, key?.fromMe)
        }
      } catch {}
      // Para grupos: quando habilitado, emitir apenas evento de "entregue" (DELIVERY_ACK)
      try {
        const useFilter = !!this.config.groupOnlyDeliveredStatus
        if (useFilter) {
          const filtered = Array.isArray(messages)
            ? (messages as any[]).filter((m: any) => {
                const jid = m?.key?.remoteJid || m?.remoteJid
                if (typeof jid === 'string' && jid.endsWith('@g.us')) {
                  const st = m?.status ?? m?.update?.status
                  return st === 3 || st === '3' || st === 'DELIVERY_ACK'
                }
                return true
              })
            : messages
          try {
            const sample = filtered.slice(0, 2).map((u: any) => ({ jid: u?.key?.remoteJid, id: u?.key?.id, status: u?.update?.status, stub: u?.update?.messageStubType }))
            logger.debug('messages.update %s count=%s sample=%s', this.phone, filtered.length, JSON.stringify(sample))
          } catch { logger.debug('messages.update %s count=%s', this.phone, filtered.length) }
          return this.listener.process(this.phone, filtered as any, 'update')
        }
      } catch {}
      try {
        const sample = messages.slice(0, 2).map((u: any) => ({ jid: u?.key?.remoteJid, id: u?.key?.id, status: (u as any)?.update?.status, stub: (u as any)?.update?.messageStubType }))
        logger.debug('messages.update %s count=%s sample=%s', this.phone, messages.length, JSON.stringify(sample))
      } catch { logger.debug('messages.update %s count=%s', this.phone, messages.length) }
      return this.listener.process(this.phone, messages, 'update')
    })
    // Track LID<->PN mapping updates from Baileys to feed DataStore cache
    this.event('lid-mapping.update' as any, (updates: any) => {
      try {
        const sample = updates.slice(0, 2).map((u: any) => ({ from: u?.from, to: u?.to }))
        logger.debug('lid-mapping.update %s count=%s sample=%s', this.phone, updates.length, JSON.stringify(sample))
      } catch {}
    })
    this.event('message-receipt.update', (updates: object[]) => {
      // Para mensagens de grupo, quando habilitado, ignorar recibos individuais (read/played/delivery por participante)
      try {
        if (this.config.ignoreGroupIndividualReceipts) {
          const filtered = Array.isArray(updates)
            ? (updates as any[]).filter((u: any) => {
                const jid = u?.key?.remoteJid || u?.remoteJid || u?.attrs?.from
                return !(typeof jid === 'string' && jid.endsWith('@g.us'))
              })
            : updates
          if (Array.isArray(filtered) && filtered.length === 0) {
            logger.debug('message-receipt.update %s ignorado para grupos (0 itens)', this.phone)
            return
          }
          try {
            const sample = filtered.slice(0, 2).map((u: any) => ({ jid: u?.key?.remoteJid, id: u?.key?.id, type: (u as any)?.receipt?.type, ts: (u as any)?.receipt?.t }))
            logger.debug('message-receipt.update %s count=%s sample=%s', this.phone, filtered.length, JSON.stringify(sample))
          } catch { logger.debug('message-receipt.update %s count=%s', this.phone, filtered.length) }
          this.listener.process(this.phone, filtered as any, 'update')
          return
        }
      } catch {}
      try {
        const sample = updates.slice(0, 2).map((u: any) => ({ jid: (u as any)?.key?.remoteJid, id: (u as any)?.key?.id, type: (u as any)?.receipt?.type, ts: (u as any)?.receipt?.t }))
        logger.debug('message-receipt.update %s count=%s sample=%s', this.phone, updates.length, JSON.stringify(sample))
      } catch { logger.debug('message-receipt.update %s count=%s', this.phone, updates.length) }
      this.listener.process(this.phone, updates, 'update')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.event('messages.delete', (updates: any) => {
      try {
        const sample = updates.slice(0, 2).map((u: any) => ({ jid: u?.key?.remoteJid, id: u?.key?.id }))
        logger.debug('messages.delete %s count=%s sample=%s', this.phone, updates.length, JSON.stringify(sample))
      } catch { logger.debug('messages.delete %s count=%s', this.phone, updates.length) }
      this.listener.process(this.phone, updates, 'delete')
    })
    if (!this.config.ignoreHistoryMessages) {
      logger.info('Config import history messages %', this.phone)
      this.event('messaging-history.set', async ({ messages, isLatest }: { messages: proto.IWebMessageInfo[]; isLatest?: boolean }) => {
        const cutoffSec = Math.floor((Date.now() - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) / 1000)
        const filtered = (messages || []).filter((m) => {
          const ts = Number(m?.messageTimestamp || 0)
          return Number.isFinite(ts) && ts >= cutoffSec
        })
        logger.info('Importing history messages (<= %sd): %d -> %d, isLatest %s %s', HISTORY_MAX_AGE_DAYS, messages?.length || 0, filtered.length, isLatest, this.phone)
        if (filtered.length) {
          this.listener.process(this.phone, filtered, 'history')
        }
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.event('call', async (events: any[]) => {
      for (let i = 0; i < events.length; i++) {
        const { from, id, status } = events[i]
        try {
          logger.info('CALL event: from=%s id=%s status=%s', from, id, status)
        } catch {}
        if (status == 'ringing' && !this.calls.has(from)) {
          this.calls.set(from, true)
          if (this.config.rejectCalls && this.rejectCall) {
            await this.rejectCall(id, from)
            await this.sendMessage(from, { text: this.config.rejectCalls }, {});
            logger.info('Rejecting calls %s %s', this.phone, this.config.rejectCalls)
          }
          
          const messageCallsWebhook = this.config.rejectCallsWebhook || this.config.messageCallsWebhook
          if (messageCallsWebhook) {
            // Tenta resolver PN para o remetente da chamada (quando vier em LID)
            let senderPnJid: string | undefined = undefined
            try {
              if (isLidUser(from)) {
                senderPnJid = await this.store?.dataStore?.getPnForLid?.(this.phone, from)
              }
            } catch {}
            try {
              if (!senderPnJid && isLidUser(from)) {
                // Fallback leve: normaliza o JID (pode retornar PN em alguns cenários)
                senderPnJid = jidNormalizedUser(from)
              }
            } catch {}
            try {
              logger.info('CALL resolve mapping: from=%s isLid=%s mappedPn=%s', from, isLidUser(from), senderPnJid || '<none>')
            } catch {}
            const remoteJidKey = senderPnJid || from
            const waMessageKey = {
              fromMe: false,
              id: uuid(),
              remoteJid: remoteJidKey,
              // Ajuda o transformer a resolver PN mesmo quando o evento vier em LID (usa mapping quando disponível)
              senderPn: senderPnJid || (isLidUser(from) ? undefined : from),
            }
            try {
              logger.info('CALL notify key: remoteJid=%s senderPn=%s', waMessageKey.remoteJid, waMessageKey['senderPn'] || '<none>')
            } catch {}
            const message = {
              key: waMessageKey,
              message: {
                conversation: messageCallsWebhook,
              },
            }
            await this.listener.process(this.phone, [message], 'notify')
            try { logger.info('CALL notify enqueued for %s', from) } catch {}
          }
          setTimeout(() => {
            logger.debug('Clean call rejecteds %s', from)
            this.calls.delete(from)
          }, 10_000)
        }
      }
    })
  }

  async logout() {
    logger.debug('Logout client store for %s', this?.phone)
    await this.socketLogout()
    await this.disconnect()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(payload: any, options: any = {}) {
    /**
     * Send a message using the underlying Baileys socket.
     *
     * @param payload Cloud API-like payload (type, to, content objects)
     * @param options Extra Baileys options (e.g., composing, addressingMode, statusJidList)
     * @returns Response with Cloud API-compatible shape and optional error object
     */
    const { status, type, to } = payload
    try {
      if (status) {
        if (['sent', 'delivered', 'failed', 'progress', 'read', 'deleted'].includes(status)) {
          if (status == 'read') {
            const currentStatus = await this.store?.dataStore?.loadStatus(payload?.message_id)
            if (currentStatus != status) {
              const key = await this.store?.dataStore?.loadKey(payload?.message_id)
              try { logger.debug('key (jid=%s id=%s) for %s', key?.remoteJid, key?.id, payload?.message_id) } catch {}
              if (key?.id) {
                if (key?.id.indexOf('-') > 0) {
                  logger.debug('Ignore read message for %s with key id %s reading message key %s...', this.phone, key?.id)
                } else {
                  try { logger.debug('baileys %s reading message (jid=%s id=%s)...', this.phone, key?.remoteJid, key?.id) } catch {}
                  if (await this.readMessages([key])) {
                    await this.store?.dataStore?.setStatus(payload?.message_id, status)
                    try { logger.debug('baileys %s read message (jid=%s id=%s)!', this.phone, key?.remoteJid, key?.id) } catch {}
                  } else {
                    try { logger.debug('baileys %s not read message (jid=%s id=%s)!', this.phone, key?.remoteJid, key?.id) } catch {}
                    throw `not online session ${this.phone}`
                  }
                }
              }
            } else {
              logger.debug('baileys %s already read message id %s!', this.phone, payload?.message_id)
            }
          } else if (status == 'deleted') {
            const key = await this.store?.dataStore?.loadKey(payload?.message_id)
            try { logger.debug('key (jid=%s id=%s) for %s', key?.remoteJid, key?.id, payload?.message_id) } catch {}
            if (key?.id) {
              if (key?.id.indexOf('-') > 0) {
                logger.debug('Ignore delete message for %s with key id %s reading message key %s...', this.phone, key?.id)
              } else {
                try { logger.debug('baileys %s deleting message (jid=%s id=%s)...', this.phone, key?.remoteJid, key?.id) } catch {}
                if (await this.sendMessage(key.remoteJid!, { delete: key }, {})) {
                  await this.store?.dataStore?.setStatus(payload?.message_id, status)
                  try { logger.debug('baileys %s delete message (jid=%s id=%s)!', this.phone, key?.remoteJid, key?.id) } catch {}
                } else {
                  try { logger.debug('baileys %s not delete message (jid=%s id=%s)!', this.phone, key?.remoteJid, key?.id) } catch {}
                  throw `not online session ${this.phone}`
                }
              }
            }
          } else {
            await this.store?.dataStore?.setStatus(payload?.message_id, status)
          }
          const r: Response = { ok: { success: true } }
          return r
        } else {
          throw new Error(`Unknow message status ${status}`)
        }
      } else if (type) {
        if (['text', 'image', 'audio', 'sticker', 'document', 'video', 'template', 'interactive', 'contacts'].includes(type)) {
          let content
          if ('template' === type) {
            const template = new Template(this.getConfig)
            content = await template.bind(this.phone, payload.template.name, payload.template.components)
          } else {
            if (VALIDATE_MEDIA_LINK_BEFORE_SEND && TYPE_MESSAGES_MEDIA.includes(type)) {
              const link = payload[type] && payload[type].link
              if (link) {
                const response: FetchResponse = await fetch(link, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), method: 'HEAD'})
                if (!response.ok) {
                  throw new SendError(11, t('invalid_link', response.status, link))
                }
              }
            }
            content = toBaileysMessageContent(payload, this.config.customMessageCharactersFunction)
            if (CONVERT_AUDIO_MESSAGE_TO_OGG && content.audio && content.ptt) {
              try {
                const url = content.audio?.url
                if (url) {
                  const { buffer, waveform, mimetype: outType } = await convertToOggPtt(url, FETCH_TIMEOUT_MS)
                  content.audio = buffer
                  content.waveform = waveform
                  content.mimetype = outType || 'audio/ogg; codecs=opus'
                  content.ptt = true
                  logger.debug('Audio converted to OGG/Opus PTT for %s', url)
                } else {
                  logger.debug('Skip audio conversion (not mp3 or missing url). url: %s', url)
                }
              } catch (err) {
                logger.warn(err, 'Ignore error converting audio to ogg sending original')
              }
            }
          }
          let quoted: WAMessage | undefined = undefined
          let disappearingMessagesInChat: boolean | number = false
          const messageId = payload?.context?.message_id || payload?.context?.id
          if (messageId) {
            const key = await this.store?.dataStore?.loadKey(messageId)
            try { logger.debug('Quoted message key %s!', key?.id) } catch {}
            if (key?.id) {
              const remoteJid = phoneNumberToJid(to)
              quoted = await this.store?.dataStore.loadMessage(remoteJid, key?.id)
              if (!quoted) {
                const unoId = await this.store?.dataStore?.loadUnoId(key?.id)
                if (unoId) {
                  quoted = await this.store?.dataStore.loadMessage(remoteJid, unoId)
                }
              }
              try {
                const qid = quoted?.key?.id
                const qjid = quoted?.key?.remoteJid
                const qtype = quoted?.message ? Object.keys(quoted.message)[0] : 'unknown'
                logger.debug('Quoted message loaded (jid=%s id=%s type=%s)', qjid, qid, qtype)
              } catch { logger.debug('Quoted message loaded') }
            }
          }
          if (payload?.ttl) {
            disappearingMessagesInChat = payload.ttl
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const sockDelays = delays.get(this.phone) || (delays.set(this.phone, new Map<string, Delay>()) && delays.get(this.phone)!)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const toDelay = sockDelays.get(to) || (async (_phone: string, to) => sockDelays.set(to, this.delayBeforeSecondMessage))
          await toDelay(this.phone, to)
          // Prefetch foto de perfil do destino (1:1 ou grupo) para garantir cache atualizado em FS/S3
          try {
            if (this.config.sendProfilePicture && typeof to === 'string') {
              const prefetchJid = to.includes('@') ? to : phoneNumberToJid(to)
              logger.info('PROFILE_PICTURE prefetch start: %s', prefetchJid)
              const fetched = await this.fetchImageUrl(prefetchJid)
              logger.info('PROFILE_PICTURE prefetch done: %s -> %s', prefetchJid, fetched || '<none>')
            }
          } catch (e) {
            try {
              const prefetchJid = to.includes('@') ? to : phoneNumberToJid(to)
              logger.warn(e as any, 'PROFILE_PICTURE prefetch error for %s', prefetchJid)
            } catch { logger.warn(e as any, 'PROFILE_PICTURE prefetch error') }
          }
          let response
          // merge base options and ensure status broadcast defaults when applicable
          const messageOptions: any = {
            composing: this.config.composingMessage,
            quoted,
            disappearingMessagesInChat,
            ...options,
          }
          // Apply addressing mode para grupos
          // Se GROUP_SEND_ADDRESSING_MODE estiver setada, respeita. Caso contrário, usa LID por padrão
          // para reduzir "session not found" em grupos grandes.
          try {
            if (to && to.endsWith('@g.us')) {
              let applied = ''
              if (GROUP_SEND_ADDRESSING_MODE) {
                const preferred = GROUP_SEND_ADDRESSING_MODE
                const mode = preferred === 'lid' ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN
                messageOptions.addressingMode = mode
                applied = preferred
              }
              // Caso não haja preferência via env, usar LID por padrão
              if (!applied) {
                messageOptions.addressingMode = WAMessageAddressingMode.LID
                applied = 'lid'
              }
              if (!applied) {
                // Fallback: don't force; let Baileys decide
                delete (messageOptions as any).addressingMode
                applied = 'auto'
              }
              logger.debug('Applied group addressingMode %s for %s', applied, to)
            }
          } catch (e) {
            logger.warn(e, 'Ignore error applying group addressingMode')
          }
          // Soft membership check: warn when not found, but do not block send
          if (to && to.endsWith('@g.us') && GROUP_SEND_MEMBERSHIP_CHECK) {
            try {
              const gm = await this.fetchGroupMetadata(to)
              const myId = jidNormalizedUser(this.store?.state.creds.me?.id)
              const participants = gm?.participants || []
              const isParticipant = participants.length > 0 && !!participants.find?.((p: any) => {
                const anyId = p?.id || p?.jid || p?.lid
                try {
                  return anyId && jidNormalizedUser(anyId) === myId
                } catch {
                  return false
                }
              })
              if (!isParticipant) {
                logger.warn('Membership not verified for group %s (self: %s, participants: %s) — proceeding to send', to, myId, participants.length)
              }
            } catch (err) {
              logger.warn(err, 'Ignore error on group membership check; proceeding to send')
            }
          }
          if (to === 'status@broadcast') {
            if (typeof messageOptions.broadcast === 'undefined') messageOptions.broadcast = true
            if (typeof messageOptions.statusJidList === 'undefined') messageOptions.statusJidList = []
          }
          if (content?.listMessage) {
            response = await this.sendMessage(
              to,
              {
                forward: {
                  key: {
                    remoteJid: jidToPhoneNumber(jidNormalizedUser(this.store?.state.creds.me?.id)),
                    fromMe: true,
                  },
                  message: {
                    ...content,
                  },
                },
              },
              messageOptions,
            )
          } else {
            response = await this.sendMessage(to, content, messageOptions)
          }

          if (response) {
            // Evita JSON.stringify no WAProto (pode disparar Long.toString com this incorreto)
            try {
              const summary = {
                key: {
                  id: (response as any)?.key?.id,
                  remoteJid: (response as any)?.key?.remoteJid,
                  fromMe: (response as any)?.key?.fromMe,
                  participant: (response as any)?.key?.participant,
                },
                messageType: (() => {
                  try { return Object.keys((response as any)?.message || {})[0] } catch { return undefined }
                })(),
                messageTimestamp: (response as any)?.messageTimestamp,
                status: (response as any)?.status,
              }
              logger.debug('Sent to baileys %s', JSON.stringify(summary))
            } catch {
              try {
                logger.debug('Sent to baileys (jid=%s id=%s)', (response as any)?.key?.remoteJid, (response as any)?.key?.id)
              } catch { logger.debug('Sent to baileys') }
            }
            const key = response.key
            await this.store?.dataStore?.setKey(key.id, key)
            await this.store?.dataStore?.setMessage(key.remoteJid, response)
            const ok = {
              messaging_product: 'whatsapp',
              contacts: [
                {
                  wa_id: jidToPhoneNumber(to, ''),
                },
              ],
              messages: [
                {
                  id: key.id,
                },
              ],
            }
            try {
              if (to === 'status@broadcast') {
                const skipped = (response as any).__statusSkipped || []
                // expose auxiliary info without breaking Cloud API shape
                ;(ok as any).status_skipped = skipped
                ;(ok as any).status_recipients = Array.isArray((messageOptions as any).statusJidList)
                  ? (messageOptions as any).statusJidList.length
                  : 0
              }
            } catch {}
            const r: Response = { ok }
            return r
          }
        } else {
          throw new Error(`Unknow message type ${type}`)
        }
      }
    } catch (ee) {
      let e = ee
      if (ee.message == 'Media upload failed on all hosts') {
        const link = payload[type] && payload[type].link
        if (link) {
          const response: FetchResponse = await fetch(link, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), method: 'HEAD'})
          if (!response.ok) {
            e = new SendError(11, t('invalid_link', response.status, link))
          }
        } else {
          e = new SendError(11, ee.message)
        }
      }
      if (e instanceof SendError) {
        const code = e.code
        const title = e.title
        await this.onNotification(title, true)
        if ([3, '3', 12, '12'].includes(code)) {
          await this.close()
          await this.connect(1)
        }
        const id = uuid()
        const ok = {
          messaging_product: 'whatsapp',
          contacts: [
            {
              wa_id: jidToPhoneNumber(to, ''),
            },
          ],
          messages: [
            {
              id,
            },
          ],
        }
        const error = {
          object: 'whatsapp_business_account',
          entry: [
            {
              id: this.phone,
              changes: [
                {
                  value: {
                    messaging_product: 'whatsapp',
                    metadata: {
                      display_phone_number: this.phone,
                      phone_number_id: this.phone,
                    },
                    statuses: [
                      {
                        id,
                        recipient_id: jidToPhoneNumber(to || this.phone, ''),
                        status: 'failed',
                        timestamp: Math.floor(Date.now() / 1000),
                        errors: [
                          {
                            code,
                            title,
                          },
                        ],
                      },
                    ],
                  },
                  field: 'messages',
                },
              ],
            },
          ],
        }
        const r: Response = { ok, error }
        return r
      } else {
        throw e
      }
    }
    throw new Error(`Unknow message type ${JSON.stringify(payload)}`)
  }

  async getMessageMetadata<T>(message: T) {
    /**
     * Enrich an outbound/inbound message with user/group metadata and pictures when available.
     * It is safe/no-op if the session is offline.
     */
    if (!this.store || !await this.store.sessionStore.isStatusOnline(this.phone)) {
      return message
    }
    const key = message && message['key']
    let remoteJid
    if (key.remoteJid && isJidGroup(key.remoteJid)) {
      logger.debug(`Retrieving group metadata...`)
      remoteJid = key.participant
      let groupMetadata: GroupMetadata | undefined
      try {
        groupMetadata = await this.fetchGroupMetadata(key.remoteJid)
      } catch (error) {
        logger.warn(error, 'Ignore error fetch group metadata')
      }
      if (groupMetadata) {
        logger.debug(groupMetadata, 'Retrieved group metadata!')
      } else {
        groupMetadata = {
          // owner_country_code: '55',
          addressingMode: isLidUser(key.remoteJid) ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN,
          id: key.remoteJid,
          owner: '',
          subject: key.remoteJid,
          participants: [],
        }
      }
      const gm = groupMetadata!
      message['groupMetadata'] = gm
      logger.debug(`Retrieving group profile picture...`)
      try {
        const profilePictureGroup = await this.fetchImageUrl(key.remoteJid)
        if (profilePictureGroup) {
          logger.debug(`Retrieved group picture! ${profilePictureGroup}`)
          gm['profilePicture'] = profilePictureGroup
        }
      } catch (error) {
        logger.warn(error)
        logger.warn(error, 'Ignore error on retrieve group profile picture')
      }
    } else {
      remoteJid = key.remoteJid
    }
    // Primeiro tenta anexar foto diretamente com o JID conhecido (evita depender de onWhatsApp)
    try {
      if (remoteJid && this.config.sendProfilePicture) {
        const direct = await this.fetchImageUrl(remoteJid)
        if (direct) {
          try { message['profilePicture'] = direct } catch {}
        } else {
          // Fallback: resolve JID via exists() e tenta novamente
          try {
            const resolved = await this.exists(remoteJid)
            if (resolved) {
              const url = await this.fetchImageUrl(resolved)
              if (url) { try { message['profilePicture'] = url } catch {} }
            }
          } catch {}
        }
      }
    } catch (e) { logger.debug(e as any, 'Ignore error attaching direct profile picture') }
    // Normalize LID senders to PN where possible to improve downstream delivery/webhook payloads
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const k: any = key
      if (k?.remoteJid && isLidUser(k.remoteJid)) {
        // Preserve original LID and expose a PN-normalized variant
        k.senderLid = k.remoteJid
        k.senderPn = jidNormalizedUser(k.remoteJid)
        try { await this.store?.dataStore?.setJidMapping?.(this.phone, k.senderPn, k.senderLid) } catch {}
      }
      if (k?.participant && isLidUser(k.participant)) {
        k.participantLid = k.participant
        k.participantPn = jidNormalizedUser(k.participant)
        try { await this.store?.dataStore?.setJidMapping?.(this.phone, k.participantPn, k.participantLid) } catch {}
      }
    } catch (e) {
      logger.warn(e, 'Ignore LID normalization error')
    }
    if (remoteJid) {
      const jid = await this.exists(remoteJid)
      if (jid) {
        try {
          logger.debug(`Retrieving user picture for %s...`, jid)
          const profilePicture = await this.fetchImageUrl(jid)
          if (profilePicture) {
            logger.debug('Retrieved user picture %s for %s!', profilePicture, jid)
            message['profilePicture'] = profilePicture
          } else {
            logger.debug(`Not found user picture for %s!`, jid)
          }
        } catch (error) {
          logger.warn(error)
          logger.warn(error, 'Ignore error on retrieve user profile picture')
        }
      }
    }
    return message
  }

  public async contacts(numbers: string[]) {
    /**
     * Validate a list of phone numbers using Baileys onWhatsApp/exists().
     * Returns the resolved JIDs and validity flags.
     */
    const contacts: Contact[] = []
    for (let index = 0; index < numbers.length; index++) {
      const number = numbers[index]
      // Let exists() resolve using the raw number; avoids incorrect digit insertion
      const realJid = await this.exists(`${number}`.trim())
      contacts.push({
        wa_id: realJid,
        input: number,
        status: realJid ? 'valid' : 'invalid'
      })
    }
    return contacts
  }
}
