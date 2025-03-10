import { GroupMetadata, WAMessage, proto, delay, isJidGroup, jidNormalizedUser } from 'baileys'
import fetch, { Response as FetchResponse } from 'node-fetch'
import { Incoming } from './incoming'
import { Listener } from './listener'
import { Store } from './store'
import {
  connect,
  SendError,
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
import { Config, defaultConfig, getConfig } from './config'
import { toBaileysMessageContent, phoneNumberToJid, jidToPhoneNumber } from './transformer'
import { v1 as uuid } from 'uuid'
import { Response } from './response'
import QRCode from 'qrcode'
import { Template } from './template'
import logger from './logger'
import { FETCH_TIMEOUT_MS, VALIDATE_MEDIA_LINK_BEFORE_SEND } from '../defaults'
const attempts = 3

interface Delay {
  (phone: string, to: string): Promise<void>
}

const delays: Map<string, Map<string, Delay>> = new Map()

export const getClientBaileys: getClient = async ({
  phone,
  incoming,
  listener,
  getConfig,
  onNewLogin,
}: {
  phone: string
  incoming: Incoming
  listener: Listener
  getConfig: getConfig
  onNewLogin: OnNewLogin
}): Promise<Client> => {
  if (!clients.has(phone)) {
    logger.info('Creating client baileys %s', phone)
    const client = new ClientBaileys(phone, incoming, listener, getConfig, onNewLogin)
    const config = await getConfig(phone)
    if (config.autoConnect) {
      logger.info('Connecting client baileys %s', phone)
      await client.connect(1)
      logger.info('Created and connected client baileys %s', phone)
    } else {
      logger.info('Config client baileys to not auto connect %s', phone)
    }
    clients.set(phone, client)
  } else {
    logger.debug('Retrieving client baileys %s', phone)
  }
  return clients.get(phone) as Client
}

const sendError = new SendError(3, 'disconnect number, please send a message do try reconnect and read qr code if necessary')

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sendMessageDefault: sendMessage = async (_phone, _message) => {
  throw sendError
}

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
  private phone: string
  private config: Config = defaultConfig
  private close: close = closeDefault
  private sendMessage = sendMessageDefault
  private event
  private fetchImageUrl = fetchImageUrlDefault
  private exists = existsDefault
  private socketLogout = logoutDefault
  private fetchGroupMetadata = fetchGroupMetadataDefault
  private readMessages = readMessagesDefault
  private rejectCall: rejectCall | undefined = rejectCallDefault
  private incoming: Incoming
  private listener: Listener
  private store: Store | undefined
  private calls = new Map<string, boolean>()
  private getConfig: getConfig
  private onNewLogin

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private onWebhookError = async (error: any) => {
    const { sessionStore } = this.store!
    if (!this.config.throwWebhookError && error.name === 'FetchError' && (await sessionStore.isStatusOnline(this.phone))) {
      return this.incoming.send(
        this.phone,
        { to: this.phone, type: 'text', text: { body: `Error on send message to webhook: ${error.message}` } },
        {},
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
          await this.store?.dataStore?.setKey(id, waMessageKey)
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
    const waMessage: WAMessage = {
      key: waMessageKey,
      message: {
        imageMessage: {
          url: qrCodeUrl,
          mimetype: 'image/png',
          fileLength: qrCode.length,
          caption: `Please, read the QR Code to connect on Whatsapp Web, attempt ${time} of ${limit}`,
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
      await this.store?.dataStore?.setKey(id, waMessageKey)
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

  constructor(phone: string, incoming: Incoming, listener: Listener, getConfig: getConfig, onNewLogin: OnNewLogin) {
    this.phone = phone
    this.incoming = incoming
    this.listener = listener
    this.getConfig = getConfig
    this.onNewLogin = onNewLogin
  }

  async connect(time: number) {
    logger.debug('Client Baileys connecting for %s', this.phone)
    this.config = await this.getConfig(this.phone)
    this.config.getMessageMetadata = async <T>(data: T) => {
      logger.debug(data, 'Put metadata in message')
      return this.getMessageMetadata(data)
    }
    this.store = await this.config.getStore(this.phone, this.config)
    const { send, read, event, rejectCall, fetchImageUrl, fetchGroupMetadata, exists, close, logout } = await connect({
      phone: this.phone,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      store: this.store!,
      attempts,
      time,
      onQrCode: this.onQrCode,
      onNotification: this.onNotification,
      onNewLogin: this.onNewLogin,
      config: this.config,
      onDisconnected: async () => this.disconnect(),
      onReconnect: this.onReconnect,
    })
    this.event = event
    this.sendMessage = send
    this.readMessages = read
    this.rejectCall = rejectCall
    this.fetchImageUrl = this.config.sendProfilePicture ? fetchImageUrl : fetchImageUrlDefault
    this.fetchGroupMetadata = fetchGroupMetadata
    this.close = close
    this.exists = exists
    this.socketLogout = logout
    await this.subscribe()
    logger.debug('Client Baileys connected for %s', this.phone)
  }

  async disconnect() {
    logger.debug('Disconnect client store for %s', this?.phone)
    this.store = undefined

    await this.close()
    clients.delete(this?.phone)
    this.sendMessage = sendMessageDefault
    this.readMessages = readMessagesDefault
    this.rejectCall = rejectCallDefault
    this.fetchImageUrl = fetchImageUrlDefault
    this.fetchGroupMetadata = fetchGroupMetadataDefault
    this.exists = existsDefault
    this.close = closeDefault
    this.config = defaultConfig
    this.socketLogout = logoutDefault
  }

  async subscribe() {
    this.event('messages.upsert', async (payload: { messages: []; type }) => {
      logger.debug('messages.upsert %s', this.phone, JSON.stringify(payload))
      this.listener.process(this.phone, payload.messages, payload.type)
    })
    this.event('messages.update', (messages: object[]) => {
      logger.debug('messages.update %s %s', this.phone, JSON.stringify(messages))
      this.listener.process(this.phone, messages, 'update')
    })
    this.event('message-receipt.update', (updates: object[]) => {
      logger.debug('message-receipt.update %s %s', this.phone, JSON.stringify(updates))
      this.listener.process(this.phone, updates, 'update')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.event('messages.delete', (updates: any) => {
      logger.debug('messages.delete %s', this.phone, JSON.stringify(updates))
      this.listener.process(this.phone, updates, 'delete')
    })
    if (!this.config.ignoreHistoryMessages) {
      logger.info('Config import history messages %', this.phone)
      this.event('messaging-history.set', async ({ messages, isLatest }: { messages: proto.IWebMessageInfo[]; isLatest?: boolean }) => {
        logger.info('Importing history messages, is latest %s %s', isLatest, this.phone)
        this.listener.process(this.phone, messages, 'history')
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.event('call', async (events: any[]) => {
      for (let i = 0; i < events.length; i++) {
        const { from, id, status } = events[i]
        if (status == 'ringing' && !this.calls.has(from)) {
          this.calls.set(from, true)
          if (this.config.rejectCalls && this.rejectCall) {
            await this.rejectCall(id, from)
            await this.incoming.send(this.phone, { to: from, type: 'text', text: { body: this.config.rejectCalls } }, {})
            logger.info('Rejecting calls %s %s', this.phone, this.config.rejectCalls)
          }
          const messageCallsWebhook = this.config.rejectCallsWebhook || this.config.messageCallsWebhook
          if (messageCallsWebhook) {
            const id = uuid()
            const waMessageKey = {
              fromMe: false,
              id: uuid(),
              remoteJid: from,
            }
            const message = {
              key: waMessageKey,
              message: {
                conversation: messageCallsWebhook,
              },
            }
            await this.store?.dataStore?.setKey(id, waMessageKey)
            await this.listener.process(this.phone, [message], 'notify')
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
    await this.disconnect()
    logger.debug('Logout client store for %s', this?.phone)
    await this.socketLogout()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(payload: any, options: any = {}) {
    const { status, type, to } = payload
    try {
      if (status) {
        if (['sent', 'delivered', 'failed', 'progress', 'read'].includes(status)) {
          if (status == 'read') {
            const currentStatus = await this.store?.dataStore?.loadStatus(payload?.message_id)
            if (currentStatus != status) {
              const key = await this.store?.dataStore?.loadKey(payload?.message_id)
              logger.debug('key %s for %s', JSON.stringify(key), payload?.message_id)
              if (key?.id) {
                if (key?.id.indexOf('-') > 0) {
                  logger.debug('Ignore read message for %s with key id %s reading message key %s...', this.phone, key?.id)
                } else {
                  logger.debug('Baileys %s reading message key %s...', this.phone, JSON.stringify(key))
                  if (await this.readMessages([key])) {
                    await this.store?.dataStore?.setStatus(payload?.message_id, status)
                    logger.debug('Baileys %s read message key %s!', this.phone, JSON.stringify(key))
                  } else {
                    logger.debug('Baileys %s not read message key %s!', this.phone, JSON.stringify(key))
                    throw `not online session ${this.phone}`
                  }
                }
              }
            } else {
              logger.debug('Baileys %s already read message id %s!', this.phone, payload?.message_id)
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
        if (['text', 'image', 'audio', 'document', 'video', 'template', 'interactive', 'contacts'].includes(type)) {
          let content
          if ('template' === type) {
            const template = new Template(this.getConfig)
            content = await template.bind(this.phone, payload.template.name, payload.template.components)
          } else {
            if (VALIDATE_MEDIA_LINK_BEFORE_SEND && ['image', 'audio', 'document', 'video'].includes(type)) {
              const link = payload[type] && payload[type].link
              if (link) {
                const response: FetchResponse = await fetch(link, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), method: 'HEAD'})
                if (!response.ok) {
                  throw new SendError(11, `Http Head return ${response.status} with link ${link}`)
                }
              }
            }
            content = toBaileysMessageContent(payload)
          }
          let quoted: WAMessage | undefined = undefined
          let disappearingMessagesInChat: boolean | number = false
          const messageId = payload?.context?.message_id || payload?.context?.id
          if (messageId) {
            const key = await this.store?.dataStore?.loadKey(messageId)
            logger.debug('Quoted message key %s!', key?.id)
            if (key?.id) {
              const remoteJid = phoneNumberToJid(to)
              quoted = await this.store?.dataStore.loadMessage(remoteJid, key?.id)
              if (!quoted) {
                const unoId = await this.store?.dataStore?.loadUnoId(key?.id)
                if (unoId) {
                  quoted = await this.store?.dataStore.loadMessage(remoteJid, unoId)
                }
              }
              logger.debug('Quoted message %s!', JSON.stringify(quoted))
            }
          }
          logger.debug('Send baileys from %s to %s -> %s', this.phone, to, JSON.stringify(content))
          if (payload?.ttl) {
            disappearingMessagesInChat = payload.ttl
          }
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const sockDelays = delays.get(this.phone) || (delays.set(this.phone, new Map<string, Delay>()) && delays.get(this.phone)!)
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const toDelay = sockDelays.get(to) || (async (_phone: string, to) => sockDelays.set(to, this.delayBeforeSecondMessage))
          await toDelay(this.phone, to)
          let response
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
              {
                composing: this.config.composingMessage,
                quoted,
                disappearingMessagesInChat,
                ...options,
              },
            )
          } else {
            response = await this.sendMessage(to, content, {
              composing: this.config.composingMessage,
              quoted,
              disappearingMessagesInChat,
              ...options,
            })
          }

          if (response) {
            logger.debug('Sent to baileys %s', JSON.stringify(response))
            const key = response.key
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
        e = new SendError(11, ee.message)
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
                        recipient_id: jidToPhoneNumber(to, ''),
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
    if (!this.store || !(await this.store.sessionStore.isStatusOnline(this.phone))) {
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
          id: key.remoteJid,
          owner: '',
          subject: key.remoteJid,
          participants: [],
        }
      }
      message['groupMetadata'] = groupMetadata
      logger.debug(`Retrieving group profile picture...`)
      try {
        const profilePictureGroup = await this.fetchImageUrl(key.remoteJid)
        if (profilePictureGroup) {
          logger.debug(`Retrieved group picture! ${profilePictureGroup}`)
          groupMetadata['profilePicture'] = profilePictureGroup
        }
      } catch (error) {
        logger.warn(error)
        logger.warn(error, 'Ignore error on retrieve group profile picture')
      }
    } else {
      remoteJid = key.remoteJid
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
    const contacts: Contact[] = []
    for (let index = 0; index < numbers.length; index++) {
      const number = numbers[index]
      const testJid = phoneNumberToJid(number)
      const realJid = await this.exists(testJid)
      contacts.push({
        wa_id: realJid,
        input: number,
        status: realJid ? 'valid' : 'invalid'
      })
    }
    return contacts
  }
}
