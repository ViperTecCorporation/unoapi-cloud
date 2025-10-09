import makeWASocket, {
  DisconnectReason,
  WABrowserDescription,
  fetchLatestBaileysVersion,
  WAMessageKey,
  delay,
  proto,
  WASocket,
  AnyMessageContent,
  BaileysEventMap,
  GroupMetadata,
  Browsers,
  ConnectionState,
  UserFacingSocketConfig,
  fetchLatestWaWebVersion,
  jidNormalizedUser,
  isLidUser,
  WAMessageAddressingMode,
} from '@whiskeysockets/baileys'
import MAIN_LOGGER from '@whiskeysockets/baileys/lib/Utils/logger'
import { Config, defaultConfig } from './config'
import { Store } from './store'
import { isIndividualJid, isValidPhoneNumber, jidToPhoneNumber, phoneNumberToJid } from './transformer'
import logger from './logger'
import { Level } from 'pino'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { useVoiceCallsBaileys } from 'voice-calls-baileys/lib/services/transport.model'
import { 
  DEFAULT_BROWSER,
  LOG_LEVEL,
  CONNECTING_TIMEOUT_MS,
  MAX_CONNECT_TIME,
  MAX_CONNECT_RETRY,
  CLEAN_CONFIG_ON_DISCONNECT,
  VALIDATE_SESSION_NUMBER,
} from '../defaults'
import { STATUS_ALLOW_LID, GROUP_SEND_PREASSERT_SESSIONS } from '../defaults'
import { STATUS_BROADCAST_ENABLED } from '../defaults'
import { t } from '../i18n'
import { SendError } from './send_error'

const EVENTS = [
  'connection.update',
  'creds.update',
  'messaging-history.set',
  'chats.upsert',
  'chats.update',
  'chats.phoneNumberShare',
  'chats.delete',
  'presence.update',
  'contacts.upsert',
  'contacts.update',
  'messages.delete',
  'messages.update',
  'messages.media-update',
  'messages.upsert',
  'messages.reaction',
  'message-receipt.update',
  'groups.upsert',
  'groups.update',
  'group-participants.update',
  'blocklist.set',
  'blocklist.update',
  'call',
  'labels.edit',
  'labels.association',
  'offline.preview',
  'lid-mapping.update',
]

export type OnQrCode = (qrCode: string, time: number, limit: number) => Promise<void>
export type OnNotification = (text: string, important: boolean) => Promise<void>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OnDisconnected = (phone: string, payload: any) => Promise<void>
export type OnNewLogin = (phone: string) => Promise<void>
export type OnReconnect = (time: number) => Promise<void>

export interface sendMessage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_phone: string, _message: AnyMessageContent, _options: unknown): Promise<any>
}

export interface readMessages {
  (_keys: WAMessageKey[]): Promise<boolean>
}

export interface rejectCall {
  (_callId: string, _callFrom: string): Promise<void>
}

export interface fetchImageUrl {
  (_jid: string): Promise<string | undefined>
}

export interface fetchGroupMetadata {
  (_jid: string): Promise<GroupMetadata | undefined>
}

export interface exists {
  (_jid: string): Promise<string | undefined>
}

export interface close {
  (): Promise<void>
}

export interface logout {
  (): Promise<void>
}

export type Status = {
  attempt: number
}

/**
 * Establish and manage a Baileys WASocket connection bound to a phone session.
 * Exposes a high-level API (send/read/exists/close/logout) used by ClientBaileys.
 */
export const connect = async ({
  phone,
  store,
  onQrCode,
  onNotification,
  onDisconnected,
  onReconnect,
  onNewLogin,
  attempts = Infinity,
  time,
  config = defaultConfig,
}: {
  phone: string
  store: Store
  onQrCode: OnQrCode
  onNotification: OnNotification
  onDisconnected: OnDisconnected
  onReconnect: OnReconnect
  onNewLogin: OnNewLogin
  attempts: number
  time: number
  config: Partial<Config>
}) => {
  let sock: WASocket | undefined = undefined
  const msgRetryCounterCache = (() => {
    const store = new Map<string, unknown>()
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: <T = any>(key: string): T | undefined => store.get(key) as T | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set: <T = any>(key: string, value: T) => (store.set(key, value), true as const),
      del: (key: string) => store.delete(key),
      flushAll: () => store.clear(),
    }
  })()
  const whatsappVersion = config.whatsappVersion
  const eventsMap = new Map()
  const { dataStore, state, saveCreds, sessionStore } = store
  // Track recent group sends to enable a single fallback retry on ack 421
  const pendingGroupSends: Map<string, { to: string; message: AnyMessageContent; options: any; attempted: Set<'pn' | 'lid' | ''>; retries: number }> = new Map()
  const firstSaveCreds = async () => {
    if (state?.creds?.me?.id) {
      // Normalize possible LID JID to PN JID before extracting phone
      let meId = state?.creds?.me?.id as string
      try {
        if (isLidUser(meId)) {
          meId = jidNormalizedUser(meId)
        }
      } catch {}
      const phoneCreds = jidToPhoneNumber(meId, '')
      logger.info(`First save creds with number is ${phoneCreds} and configured number ${phone}`)
      if (VALIDATE_SESSION_NUMBER && phoneCreds != phone) {
        await logout()
        const message =  t('session_conflict', phoneCreds, phone)
        logger.error(message)
        await onNotification(message, true)
        currentSaveCreds = async () => logger.error(message)
      } else {
        logger.info(`Correct save creds with number is ${phoneCreds} and configured number ${phone}`)
        currentSaveCreds = saveCreds
      }
    }
  }
  let currentSaveCreds = firstSaveCreds
  const verifyAndSaveCreds = async () => currentSaveCreds()
  let connectingTimeout

  const status: Status = {
    attempt: time,
  }

  const onConnectionUpdate = async (event: Partial<ConnectionState>) => {
    logger.debug('onConnectionUpdate connectionType %s ==> %s %s', config.connectionType, phone, JSON.stringify(event))
    if (event.qr && config.connectionType == 'qrcode' && !sock?.authState?.creds?.registered) {
      if (status.attempt > attempts) {
        const message =  t('attempts_exceeded', attempts)
        logger.debug(message)
        await onNotification(message, true)
        status.attempt = 1
        return logout()
      } else {
        logger.debug('QRCode generate... %s of %s', status.attempt, attempts)
        return onQrCode(event.qr, status.attempt++, attempts)
      }
    }

    if (event.isNewLogin) {
      await onNewLogin(phone)
      await sessionStore.setStatus(phone, 'online')
    }

    if (event.receivedPendingNotifications) {
      await onNotification(t('received_pending_notifications'), true)
    }

    if (event.isOnline) {
      await sessionStore.setStatus(phone, 'online')
      await onNotification(t('online_session'), true)
    }
    
    switch (event.connection) {
      case 'open':
        await onOpen()
        break
        
        case 'close':
        await onClose(event)
        break

      case 'connecting':
        await onConnecting()
        break
    }
  }

  const verifyConnectingTimeout = async () => {
    if (connectingTimeout) {
      return
    }
    logger.info(`Connecting ${phone} set timeout to ${CONNECTING_TIMEOUT_MS} ms`)
    if (await sessionStore.isStatusConnecting(phone)) {
      connectingTimeout = setTimeout(async () => {
        if (await sessionStore.isStatusConnecting(phone)) {
          connectingTimeout = null
          const message = t('connection_timed_out', phone, CONNECTING_TIMEOUT_MS)
          await onNotification(message, false)
          logger.warn(message)
          await onDisconnected(phone, {})
        }
        await sessionStore.syncConnection(phone)
      }, CONNECTING_TIMEOUT_MS)
    } else {
      connectingTimeout = null
    }
  }

  const onConnecting = async () => {
    await sessionStore.setStatus(phone, 'connecting')
    const message = t('connecting')
    await onNotification(message, false)
    logger.info(message)
    return verifyConnectingTimeout()
  }

  const onOpen = async () => {
    status.attempt = 1
    await sessionStore.setStatus(phone, 'online')
    logger.info(`${phone} connected`)
    const { version } = await fetchLatestBaileysVersion()
    const message = t('connected', phone, whatsappVersion ? whatsappVersion.join('.') : 'auto', version.join('.'), new Date().toUTCString())
    await onNotification(message, false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onClose = async (payload: any) => {
    if (await sessionStore.isStatusOffline(phone)) {
      logger.warn('Already Offline %s', phone)
      sock = undefined
      return
    }
    if (await sessionStore.isStatusDisconnect(phone)) {
      logger.warn('Already Disconnected %s', phone)
      sock = undefined
      return
    }
    const { lastDisconnect } = payload
    const statusCode = lastDisconnect?.error?.output?.statusCode
    logger.info(`${phone} disconnected with status: ${statusCode}`)
    if ([DisconnectReason.loggedOut, 403].includes(statusCode)) {
      status.attempt = 1
      if (!await sessionStore.isStatusConnecting(phone)) {
        const message = t('removed')
        await onNotification(message, true)
      }
      await logout()
      return onDisconnected(phone, payload)
    } else if (statusCode === DisconnectReason.connectionReplaced) {
      await close()
      const message = t('unique')
      return onNotification(message, true)
    } else if (statusCode === DisconnectReason.restartRequired) {
      const message = t('restart')
      await onNotification(message, true)
      await sessionStore.setStatus(phone, 'restart_required')
      await close()
      return onReconnect(1)
    } else if (statusCode === DisconnectReason.badSession && config.proxyUrl && lastDisconnect?.error?.data?.options?.command?.connect) {
      const message = t('server_error', config.proxyUrl)
      await onNotification(message, true)
    } else if (status.attempt == 1) {
      const detail = lastDisconnect?.error?.output?.payload?.error
      const message = t('closed', statusCode, detail)
      await onNotification(message, true)
    }
    return reconnect()
  }

  const getMessage = async (key: proto.IMessageKey): Promise<proto.IMessage | undefined> => {
    // Consider new Alt addressing fields introduced with LIDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k: any = key as any
    let remoteJid = key.remoteJid || k.remoteJidAlt
    const id = key.id
    let participant = key.participant || k.participantAlt
    // handle status@broadcast retries where WA doesn't include remoteJid
    let jid = remoteJid
    if (!jid && participant) {
      logger.debug('Retry without remoteJid; using participant %s for id %s', participant, id)
      jid = participant
    }
    jid = jid || 'status@broadcast'
    logger.debug('load message for jid %s id %s', jid, id)
    let message = await dataStore.loadMessage(jid, id!)
    if (!message && jid !== 'status@broadcast') {
      logger.debug('Not found under %s; trying status@broadcast for id %s', jid, id)
      message = await dataStore.loadMessage('status@broadcast', id!)
      if (message) {
        logger.debug('Found message id %s under status@broadcast', id)
      } else {
        logger.debug('Message id %s not found under %s nor status@broadcast', id, jid)
      }
    }
    return message?.message || undefined
  }

  // const patchMessageBeforeSending = (msg: proto.IMessage) => {
  //   const isProductList = (listMessage: proto.Message.IListMessage | null | undefined) =>
  //     listMessage?.listType === proto.Message.ListMessage.ListType.PRODUCT_LIST

  //   if (isProductList(msg.deviceSentMessage?.message?.listMessage) || isProductList(msg.listMessage)) {
  //     msg = JSON.parse(JSON.stringify(msg))
  //     if (msg.deviceSentMessage?.message?.listMessage) {
  //       msg.deviceSentMessage.message.listMessage.listType = proto.Message.ListMessage.ListType.SINGLE_SELECT
  //     }
  //     if (msg.listMessage) {
  //       msg.listMessage.listType = proto.Message.ListMessage.ListType.SINGLE_SELECT
  //     }
  //   }
  //   return msg
  // }

  const event = <T extends keyof BaileysEventMap>(event: T, callback: (arg: BaileysEventMap[T]) => void) => {
    logger.info('Subscribe %s event: %s', phone, event)
    if (event === 'messages.update') {
      // Wrap to detect ack 421 and perform a single fallback retry toggling addressingMode
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = async (updates: any[]) => {
        try {
          if (Array.isArray(updates)) {
            for (const u of updates) {
              const params = u?.update?.messageStubParameters
              const key = u?.key
              if (
                Array.isArray(params) &&
                params.includes('421') &&
                key?.fromMe &&
                typeof key?.remoteJid === 'string' &&
                key.remoteJid.endsWith('@g.us')
              ) {
                const pending = pendingGroupSends.get(key.id)
                if (pending && pending.retries < 1) {
                  let next: 'pn' | 'lid' = pending.attempted.has('lid') ? 'pn' : 'lid'
                  const opts = { ...(pending.options || {}) }
                  opts.addressingMode = next === 'lid' ? WAMessageAddressingMode.LID : WAMessageAddressingMode.PN
                  logger.warn('Retrying group %s message %s with addressingMode %s', pending.to, key.id, next)
                  try {
                    const resp = await sock?.sendMessage(pending.to, pending.message, opts)
                    pendingGroupSends.delete(key.id)
                    if (resp?.key?.id) {
                      pending.retries = 1
                      pending.attempted.add(next)
                      pending.options = opts
                      pendingGroupSends.set(resp.key.id, pending)
                    }
                  } catch (e) {
                    logger.warn(e as any, 'Fallback resend failed')
                  }
                }
              }
            }
          }
        } catch (e) {
          logger.warn(e as any, 'Ignore error on messages.update fallback wrapper')
        }
        return (callback as any)(updates)
      }
      eventsMap.set(event as any, wrapped as any)
    } else if (event === 'message-receipt.update') {
      // Proactively assert sessions when we receive retry receipts to reduce Bad MAC during decrypt
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wrapped = async (updates: any[]) => {
        try {
          const targets = new Set<string>()
          if (Array.isArray(updates)) {
            for (const u of updates) {
              const type = u?.receipt?.type || u?.type || u?.update?.type
              const remoteJid: string | undefined = u?.key?.remoteJid || u?.remoteJid || u?.attrs?.from
              const participant: string | undefined = u?.key?.participant || u?.participant || u?.attrs?.participant
              if (type === 'retry') {
                if (remoteJid && remoteJid.endsWith('@g.us') && participant) {
                  targets.add(participant)
                } else if (remoteJid) {
                  targets.add(remoteJid)
                }
              }
            }
          }
          if (targets.size) {
            try {
              await (sock as any).assertSessions(Array.from(targets), true)
              logger.debug('Asserted %s sessions on retry receipt', targets.size)
            } catch (e) {
              logger.warn(e as any, 'Ignore error asserting sessions on retry receipt')
            }
          }
        } catch (e) {
          logger.warn(e as any, 'Ignore error on message-receipt.update wrapper')
        }
        return (callback as any)(updates)
      }
      // @ts-ignore
      eventsMap.set(event, wrapped)
    } else {
      eventsMap.set(event, callback)
    }
  }

  const reconnect = async () => {
    logger.info(`${phone} reconnecting`, status.attempt)
    if (status.attempt > attempts) {
      const message =  t('attempts_exceeded', attempts)
      await onNotification(message, true)
      status.attempt = 1
      return close()
    } else {
      const message =  t('connecting_attemps', status.attempt, attempts)
      await onNotification(message, false)
      await close()
      return onReconnect(status.attempt++)
    }
  }

  const close = async () => {
    logger.info(`${phone} close`)
    EVENTS.forEach((e: any) => {
      try {
        sock?.ev?.removeAllListeners(e)
      } catch (error) {
        logger.error(`Error on removeAllListeners from ${e}`, error)
      }
    })
    const webSocket = sock?.ws['socket'] || {}
    // WebSocket.CONNECTING (0)
    // WebSocket.OPEN (1)
    // WebSocket.CLOSING (2)
    // WebSocket.CLOSED (3)
    if (`${webSocket['readyState']}` == '1'){
      if (await sessionStore.isStatusConnecting(phone) || await sessionStore.isStatusOnline(phone)) {
        try {
          await sock?.end(undefined)
        } catch (e) {
          logger.error(`Error sock end`, e)
        }
        try {
          await sock?.ws?.close()
        } catch (e) {
          logger.error(`Error on sock ws close`, e)
        }
      }
    }
    sock = undefined
    if (!await sessionStore.isStatusRestartRequired(phone)) {
      await sessionStore.setStatus(phone, 'offline')
    }
  }

  const logout = async () => {
    logger.info(`${phone} logout`)
    try {
      return sock && await sock.logout()
    } catch (error) {
      logger.error(`Error on remove session ${phone}: ${error.message}`,)  
      // ignore de unique error if already diconected session
    } finally {
      logger.info(`${phone} destroyed`)
      await dataStore.cleanSession(CLEAN_CONFIG_ON_DISCONNECT)
    }
    await close()
    await sessionStore.setStatus(phone, 'disconnected')
  }

  /**
   * Resolve a phone/JID to a concrete JID known by WhatsApp, caching via DataStore.
   * Accepts raw numbers (string) or JIDs and returns undefined when the number has no WhatsApp.
   */
  const exists: exists = async (localPhone: string) => {
    try {
      await validateStatus()
    } catch (error) {
      if (localPhone == phone) {
        logger.info(`${localPhone} is the phone connection ${phone}`)
      } else {
        throw error
      }
    }
    return dataStore.loadJid(localPhone, sock!)
  }

  const validateStatus = async () => {
    if (await sessionStore.isStatusConnecting(phone)) {
      await verifyConnectingTimeout()
      throw new SendError(5, t('connecting_session'))
    } else if (await sessionStore.isStatusDisconnect(phone) || !sock) {
      throw new SendError(3, t('disconnected_session'))
    } else if (await sessionStore.isStatusOffline(phone)) {
      throw new SendError(12, t('offline_session'))
    } else if (await sessionStore.isStatusStandBy(phone)) {
      throw new SendError(14, t('standby', MAX_CONNECT_RETRY, MAX_CONNECT_TIME))
    }
    if (connectingTimeout) {
      clearTimeout(connectingTimeout)
      connectingTimeout = null
    }
  }

  /**
   * Send a message to a target JID.
   * Handles:
   * - Session validation and presence
   * - LID⇄PN normalization when needed
   * - Preassert sessions (1:1 and groups) to reduce decrypt/ack errors
   * - Status/Broadcast normalization (filters invalid numbers, optional LID→PN, deduplication)
   */
  const send: sendMessage = async (
    to: string,
    message: AnyMessageContent,
    // allow passing through any Baileys MiscMessageGenerationOptions plus our custom 'composing'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any = { composing: false },
  ) => {
    await validateStatus()
    // If recipient is a LID JID, normalize to PN to improve deliverability
    const toNormalized = isLidUser(to) ? jidNormalizedUser(to) : to
    const id =  isIndividualJid(toNormalized) ? await exists(toNormalized) : toNormalized
    // For 1:1 sends, proactively assert sessions to reduce decrypt failures and improve ack reliability
    try {
      if (id && isIndividualJid(id)) {
        const set = new Set<string>()
        set.add(id)
        try {
          if (isLidUser(id)) {
            const pn = jidNormalizedUser(id)
            set.add(pn)
            try { await (dataStore as any).setJidMapping?.(phone, pn, id) } catch {}
          }
        } catch {}
        try {
          const self = state?.creds?.me?.id
          if (self) {
            set.add(self)
            try { set.add(jidNormalizedUser(self)) } catch {}
          }
        } catch {}
        const targets = Array.from(set)
        if (targets.length) {
          await (sock as any).assertSessions(targets, true)
          logger.debug('Preasserted %s sessions for 1:1 %s', targets.length, id)
        }
      }
    } catch (e) {
      logger.warn(e as any, 'Ignore error on preassert 1:1 sessions')
    }
    // For group sends, proactively assert sessions for all participants to reduce ack 421
    try {
      if (id && id.endsWith('@g.us') && GROUP_SEND_PREASSERT_SESSIONS) {
        const gm = await dataStore.loadGroupMetada(id, sock!)
        const raw: string[] = (gm?.participants || [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((p: any) => (p?.id || p?.jid || p?.lid || '').toString())
          .filter((v) => !!v)
        const set = new Set<string>()
        for (const j of raw) {
          set.add(j)
          try {
            if (isLidUser(j)) {
              const pn = jidNormalizedUser(j)
              set.add(pn)
              try { await (dataStore as any).setJidMapping?.(phone, pn, j) } catch {}
            }
          } catch {}
        }
        // include self identities as well
          try {
            const self = state?.creds?.me?.id
            if (self) {
              set.add(self)
              try { set.add(jidNormalizedUser(self)) } catch {}
            }
          } catch {}
        const targets = Array.from(set)
        if (targets.length) {
          await (sock as any).assertSessions(targets, true)
          logger.debug('Preasserted %s sessions for group %s', targets.length, id)
        }
      }
    } catch (e) {
      logger.warn(e, 'Ignore error on preassert group sessions')
    }
    if (id) {
      // Block Status (status@broadcast) sending when disabled via env to avoid account risk
      if (id === 'status@broadcast' && !STATUS_BROADCAST_ENABLED) {
        throw new SendError(16, 'status_broadcast_disabled')
      }
      const { composing, ...restOptions } = options || {}
      if (composing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i: any = message
        const time = (i?.text?.length || i?.caption?.length || 1) * Math.floor(Math.random() * 100)
        await sock?.presenceSubscribe(id)
        await delay(Math.floor(Math.random() * time) + 100)
        await sock?.sendPresenceUpdate(i?.text ? 'composing' : 'recording', id)
        await delay(Math.floor(Math.random() * time) + 200)
        await sock?.sendPresenceUpdate('paused', id)
      }
      logger.debug(`${phone} is sending message ==> ${id} ${JSON.stringify(message)}`)
      const opts = { ...restOptions }
      logger.debug('Send baileys from %s to %s -> %s', phone, id, JSON.stringify(message))
      // Workaround for Stories/Status: current Baileys sendMessage() does not pass statusJidList to relayMessage
      if (
        id === 'status@broadcast' &&
        Array.isArray((opts as any).statusJidList) &&
        (opts as any).statusJidList.length > 0
      ) {
        // normalize recipients to real JIDs (may convert to LID JIDs)
        try {
          const originalList: string[] = (opts as any).statusJidList
          // 1) Resolve existence; only keep numbers that actually have WhatsApp
          const resolved = await Promise.all(
            originalList.map(async (v: string) => {
              const raw = `${v}`.trim()
              const jid = await exists(raw)
              return { input: raw, jid }
            })
          )
          const valid = resolved.filter((r) => !!r.jid).map((r) => r.jid as string)
          const skipped = resolved.filter((r) => !r.jid).map((r) => r.input)
          if (skipped.length) {
            logger.warn('Status@broadcast will skip %d invalid numbers (no WhatsApp): %s', skipped.length, JSON.stringify(skipped.slice(0, 10)))
          }
          // 2) Optionally normalize LIDs to PN and deduplicate
          const finalList = STATUS_ALLOW_LID
            ? Array.from(new Set(valid))
            : Array.from(
                new Set(
                  valid.map((jid: string) => {
                    if ((jid || '').includes('@lid')) {
                      const num = jidToPhoneNumber(jid, '')
                      return phoneNumberToJid(num)
                    }
                    return jid
                  })
                )
              )
          ;(opts as any).statusJidList = finalList
          ;(opts as any).__statusSkipped = skipped
          logger.debug('Status@broadcast normalized valid recipients %d', finalList.length)
        } catch (e) {
          logger.warn(e, 'Ignore error normalizing statusJidList')
        }
        const full = await sock?.sendMessage(id, message, opts)
        try {
          // Attach skipped list to response for higher layers to report
          try { (full as any).__statusSkipped = (opts as any).__statusSkipped || [] } catch {}
          if (full?.message) {
            const list: string[] = (opts as any).statusJidList || []
            if (list.length > 0) {
              logger.debug('Relaying status to %s recipients', list.length)
              await sock?.relayMessage(id, full.message, {
                messageId: (full.key.id || undefined) as string | undefined,
                statusJidList: list,
              })
            } else {
              logger.debug('No valid recipients after normalization; skipping relayMessage')
            }
          } else {
            logger.debug('Status@broadcast send returned no message body to relay (key id: %s)', full?.key?.id)
          }
        } catch (error) {
          logger.warn(error, 'Ignore error on relayMessage for status broadcast')
        }
        return full
      } else if (id === 'status@broadcast') {
        // No or empty statusJidList provided; relayMessage will be skipped
        const size = Array.isArray((opts as any).statusJidList) ? (opts as any).statusJidList.length : 'none'
        logger.debug('Status@broadcast without statusJidList (size: %s); skipping relayMessage', size)
      }
      // general path: send, with fallback when libsignal reports missing sessions
      let full
      try {
        full = await sock?.sendMessage(id, message, opts)
      } catch (err: any) {
        const msg = (err?.message || `${err || ''}`).toString().toLowerCase()
        const isNoSessions = msg.includes('no sessions') || msg.includes('nosessions')
        if (isNoSessions && typeof id === 'string' && id.endsWith('@g.us')) {
          try {
            // Re-assert sessions for all group participants (including PN/LID variants) and retry once
            const gm = await dataStore.loadGroupMetada(id, sock!)
            const raw: string[] = (gm?.participants || [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((p: any) => (p?.id || p?.jid || p?.lid || '').toString())
              .filter((v) => !!v)
            const set = new Set<string>()
            for (const j of raw) {
              set.add(j)
              try {
                if (isLidUser(j)) {
                  const pn = jidNormalizedUser(j)
                  set.add(pn)
                  try { await (dataStore as any).setJidMapping?.(phone, pn, j) } catch {}
                }
              } catch {}
            }
            try {
              const self = state?.creds?.me?.id
              if (self) {
                set.add(self)
                try { set.add(jidNormalizedUser(self)) } catch {}
              }
            } catch {}
            const targets = Array.from(set)
            if (targets.length) {
              // First, try a single assert for all targets
              try {
                await (sock as any).assertSessions(targets, true)
                logger.warn('Recovered from No sessions by asserting %s targets for group %s; retrying send', targets.length, id)
              } catch (ae) {
                logger.warn(ae as any, 'Bulk assertSessions failed; retrying in chunks')
                // Fallback: chunked asserts to avoid internal size/time limits
                const chunkSize = 150
                for (let i = 0; i < targets.length; i += chunkSize) {
                  const chunk = targets.slice(i, i + chunkSize)
                  try {
                    await (sock as any).assertSessions(chunk, true)
                  } catch (ce) {
                    logger.warn(ce as any, 'Ignore error asserting chunk %s-%s', i, i + chunk.length)
                  }
                }
              }
            }
            // Small delay to allow sender keys to propagate before retrying
            try { await delay(150); } catch {}
            full = await sock?.sendMessage(id, message, opts)
          } catch (e) {
            logger.warn(e as any, 'Retry after No sessions failed')
            // Last attempt: toggle addressingMode and try once more
            try {
              const altOpts: any = { ...(opts || {}) }
              try {
                const curr = (opts as any)?.addressingMode
                if (curr === WAMessageAddressingMode.LID) altOpts.addressingMode = WAMessageAddressingMode.PN
                else altOpts.addressingMode = WAMessageAddressingMode.LID
              } catch {}
              logger.warn('Toggling addressingMode to attempt recovery from No sessions on %s', id)
              // small wait to avoid hammering
              try { await delay(120) } catch {}
              full = await sock?.sendMessage(id, message, altOpts)
            } catch (ee) {
              logger.warn(ee as any, 'Final retry after No sessions failed')
              throw err
            }
          }
        } else {
          throw err
        }
      }
      try {
        if (full?.key?.id && typeof id === 'string' && id.endsWith('@g.us')) {
          let mode: 'pn' | 'lid' | '' = ''
          try {
            const m = (opts as any).addressingMode
            mode = m === WAMessageAddressingMode.LID ? 'lid' : m === WAMessageAddressingMode.PN ? 'pn' : ''
          } catch {}
          pendingGroupSends.set(full.key.id, { to: id, message, options: { ...opts }, attempted: new Set([mode]), retries: 0 })
        }
      } catch (e) {
        logger.warn(e as any, 'Ignore error tracking pending group send')
      }
      return full
    }
    if (!isValidPhoneNumber(to)) {
      throw new SendError(7, t('invalid_phone_number', to))
    }
    throw new SendError(2, t('without_whatsapp', to))
  }

  const read: readMessages = async (keys: WAMessageKey[]) => {
    await validateStatus()

    // Proactively assert sessions for the message recipients to avoid 'No sessions' on receipts/deletes
    try {
      const targets = new Set<string>()
      for (const k of keys || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ka: any = k as any
        const remote = k?.remoteJid || ka?.remoteJidAlt
        const participant = k?.participant || ka?.participantAlt
        if (remote) {
          targets.add(remote)
          try { if (isLidUser(remote)) targets.add(jidNormalizedUser(remote)) } catch {}
        }
        if (participant) {
          targets.add(participant)
          try { if (isLidUser(participant)) targets.add(jidNormalizedUser(participant)) } catch {}
        }
      }
      if (targets.size) {
        await (sock as any).assertSessions(Array.from(targets), true)
      }
    } catch (e) {
      logger.warn(e as any, 'Ignore error asserting sessions before readMessages')
    }

    await sock?.readMessages(keys)
    return true
  }

  if (config.autoRestartMs) {
    const message = t('auto_restart', config.autoRestartMs)
    await onNotification(message, true)
    setInterval(reconnect, config.autoRestartMs)
  }

  const rejectCall: rejectCall = async (callId: string, callFrom: string) => {
    await validateStatus()

    return sock?.rejectCall(callId, callFrom)
  }

  const fetchImageUrl: fetchImageUrl = async (jid: string) => {
    return dataStore.loadImageUrl(jid, sock!)
  }

  const fetchGroupMetadata: fetchGroupMetadata = async (jid: string) => {
    return dataStore.loadGroupMetada(jid, sock!)
  }

  const connect = async () => {
    await sessionStore.syncConnection(phone)
    if (await sessionStore.isStatusConnecting(phone)) {
      logger.warn('Already Connecting %s', phone)
      return
    }
    if (await sessionStore.isStatusOnline(phone)) {
      logger.warn('Already Connected %s', phone)
      return
    }
    if (await sessionStore.verifyStatusStandBy(phone)) {
      logger.warn('Standby %s', phone)
      return
    }
    logger.debug('Connecting %s', phone)

    let browser: WABrowserDescription = DEFAULT_BROWSER as WABrowserDescription

    const loggerBaileys = MAIN_LOGGER.child({})
    logger.level = config.logLevel as Level
    loggerBaileys.level = (LOG_LEVEL) as Level

    let agent
    let fetchAgent
    if (config.proxyUrl) {
      agent = new SocksProxyAgent(config.proxyUrl)
      try {
        const undici: any = await import('undici')
        // @ts-ignore - ProxyAgent typing depends on undici version
        fetchAgent = new undici.ProxyAgent(config.proxyUrl)
      } catch (e) {
        logger.warn(e as any, 'Proxy configured but undici ProxyAgent not available; fetch uploads will not use proxy')
      }
    }
    const socketConfig: UserFacingSocketConfig = {
      auth: state,
      logger: loggerBaileys,
      syncFullHistory: !config.ignoreHistoryMessages,
      getMessage,
      shouldIgnoreJid: config.shouldIgnoreJid,
      retryRequestDelayMs: config.retryRequestDelayMs,
      msgRetryCounterCache,
      // patchMessageBeforeSending,
      agent,
      fetchAgent,
      qrTimeout: config.qrTimeoutMs,
    }
    if (whatsappVersion) {
      socketConfig.version = whatsappVersion
    } else {
      try {
        const { version } = await fetchLatestWaWebVersion()
        socketConfig.version = version
        logger.debug('Using latest WA Web version %s', JSON.stringify(version))
      } catch (e) {
        logger.warn(e as any, 'Failed to fetch WA Web version; using default')
      }
    }
    if (config.connectionType == 'pairing_code') {
      socketConfig.printQRInTerminal = false
      socketConfig.browser = Browsers.ubuntu('Chrome')
    } else {
      if (!config.ignoreHistoryMessages) {
        browser = Browsers.ubuntu('Desktop')
      }
      socketConfig.printQRInTerminal = true
      socketConfig.browser = browser
    }

    try {
      const proxy = makeWASocket(socketConfig)
      const handler = {
        apply: (target, _thisArg, argumentsList) => {
          try {
            return target(...argumentsList)
          } catch (error) {
            console.error(error, error.isBoom, !error.isServer)
            if (error && error.isBoom && !error.isServer) {
              onClose({ lastDisconnect: { error } })
              return
            } else {
              throw error
            }
          }
        }
      }
      sock = new Proxy(proxy, handler)
    } catch (error: any) {
      console.log(error, error.isBoom, !error.isServer)
      if (error && error.isBoom && !error.isServer) {
        await onClose({ lastDisconnect: { error } })
        return false
      } else {
        logger.error('baileys Socket error: %s %s', error, error.stack)
        const message = t('error', error.message)
        await onNotification(message, true)
        throw error
      }
    }
    if (sock) {
      event('connection.update', onConnectionUpdate)
      event('creds.update', verifyAndSaveCreds)
      sock.ev.process(async(events) => {
        const keys = Object.keys(events)
        for(const i in keys) {
          const key = keys[i]
          if (eventsMap.has(key)) {
            eventsMap.get(key)(events[key])
          }
        }
      })
      logger.info('Connection type %s already creds %s', config.connectionType, sock?.authState?.creds?.registered)
      if (config.connectionType == 'pairing_code' && !sock?.authState?.creds?.registered) {
        logger.info(`Requesting pairing code ${phone}`)
        try {
          // await sock.waitForConnectionUpdate(async (update) => !!update.qr)
          const onlyNumbers = phone.replace(/[^0-9]/g, '')
          const code = await sock?.requestPairingCode(onlyNumbers)
          const beatyCode = `${code?.match(/.{1,4}/g)?.join('-')}`
          const message = t('pairing_code', beatyCode)
          await onNotification(message, true)
        } catch (error) {
          console.error(error)
          throw error
        }
      }
      if (config.wavoipToken) {
        try {
          useVoiceCallsBaileys(config.wavoipToken, sock as any, 'close', true)
        } catch (e) {
          logger.warn(e, 'Ignore voice-calls-baileys error')
        }
      }
      return true
    }
    return false
  }

  if (!await connect()) {
    await sessionStore.setStatus(phone, 'offline')
    return
  }

  return { event, status, send, read, rejectCall, fetchImageUrl, fetchGroupMetadata, exists, close, logout }
}
