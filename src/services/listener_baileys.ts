import { eventType, Listener } from './listener'
import logger from './logger'
import { Outgoing } from './outgoing'
import { Broadcast } from './broadcast'
import { getConfig } from './config'
import { fromBaileysMessageContent, getMessageType, BindTemplateError, isSaveMedia, jidToPhoneNumber, jidToRawPhoneNumber, DecryptError, isValidPhoneNumber, normalizeMessageContent, getBinMessage } from './transformer'
import { WAMessage, delay, jidNormalizedUser, isPnUser } from '@whiskeysockets/baileys'
import { Template } from './template'
import { UNOAPI_DELAY_AFTER_FIRST_MESSAGE_MS, UNOAPI_DELAY_BETWEEN_MESSAGES_MS, INBOUND_DEDUP_WINDOW_MS } from '../defaults'
import { v1 as uuid } from 'uuid'
import { createHash } from 'crypto'
import { getPollState, setPollState, getStatusMediaState, setStatusMediaState } from './redis'

const  delays: Map<String, number> = new Map()
const POLL_CREATION_TYPES = new Set([
  'pollCreationMessage',
  'pollCreationMessageV2',
  'pollCreationMessageV3',
  'pollCreationMessageV5',
])
const POLL_SNAPSHOT_TYPES = new Set([
  'pollResultSnapshotMessage',
  'pollResultSnapshotMessageV3',
])
const STATUS_MEDIA_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
])
const STATUS_MEDIA_TTL_SEC = 24 * 60 * 60

const delayFunc = UNOAPI_DELAY_AFTER_FIRST_MESSAGE_MS && UNOAPI_DELAY_BETWEEN_MESSAGES_MS ? async (phone, to) => {
  if (to) { 
    const key = `${phone}:${to}`
    const epochMS: number = Math.floor(Date.now());
    const lastMessage = (delays.get(key) || 0) as number
    const timeForNextMessage = lastMessage ? Math.floor(lastMessage + (UNOAPI_DELAY_BETWEEN_MESSAGES_MS)) : Math.floor(epochMS + (UNOAPI_DELAY_AFTER_FIRST_MESSAGE_MS)) 
    const ms = timeForNextMessage - epochMS > 0 ? Math.floor((timeForNextMessage - epochMS)) : 0;
    logger.debug(`Delay for this message is: %s`, ms)
    if (ms) {
      delays.set(key, timeForNextMessage)
      await delay(ms)
    } else {
      delays.set(key, epochMS)
    }
  }
} :  async (_phone, _to) => {}

export class ListenerBaileys implements Listener {
  private outgoing: Outgoing
  private getConfig: getConfig
  private broadcast: Broadcast
  // Dedup map (messageId -> lastSeen epoch ms)
  private static seen: Map<string, number> = new Map()

  constructor(outgoing: Outgoing, broadcast: Broadcast, getConfig: getConfig) {
    this.outgoing = outgoing
    this.getConfig = getConfig
    this.broadcast = broadcast
  }

  private pollOptionHash(name: string) {
    return createHash('sha256').update(Buffer.from(name || '')).digest().toString()
  }

  private async savePollCreationState(phone: string, store: any, message: WAMessage, messageType: string) {
    try {
      if (!POLL_CREATION_TYPES.has(messageType)) return
      const payload: any = (message as any)?.message?.[messageType] || {}
      const options = Array.isArray(payload?.options) ? payload.options : []
      if (!options.length) return
      const pollName = `${payload?.name || ''}`.trim()
      const remoteJid = `${(message as any)?.key?.remoteJid || ''}`
      if (!remoteJid) return
      let pollId = `${(message as any)?.key?.id || ''}`
      if (!pollId) return
      try {
        const providerId = await store?.dataStore?.loadProviderId?.(pollId)
        if (providerId) pollId = providerId
      } catch {}
      const state = {
        pollId,
        remoteJid,
        pollName,
        options: options.reduce((acc: Record<string, string>, option: any) => {
          const name = `${option?.optionName || ''}`.trim()
          if (!name) return acc
          acc[this.pollOptionHash(name)] = name
          return acc
        }, {}),
        voters: {},
        updatedAt: Date.now(),
      }
      if (!Object.keys(state.options).length) return
      await setPollState(phone, remoteJid, pollId, state)
    } catch (e) {
      logger.warn(e as any, 'Failed to persist poll creation state')
    }
  }

  private async savePollSnapshotState(phone: string, message: WAMessage, messageType: string) {
    try {
      if (!POLL_SNAPSHOT_TYPES.has(messageType)) return
      const payload: any = (message as any)?.message?.[messageType] || {}
      const context = payload?.contextInfo || {}
      const pollId = `${context?.stanzaId || ''}`.trim()
      const remoteJid = `${(message as any)?.key?.remoteJid || ''}`.trim()
      if (!pollId || !remoteJid) return
      const pollName = `${payload?.name || ''}`.trim()
      const pollVotes = Array.isArray(payload?.pollVotes) ? payload.pollVotes : []
      const snapshotCounts = pollVotes.reduce((acc: Record<string, number>, vote: any) => {
        const name = `${vote?.optionName || ''}`.trim()
        if (!name) return acc
        const count = Number(vote?.optionVoteCount || 0)
        acc[this.pollOptionHash(name)] = Number.isFinite(count) && count > 0 ? count : 0
        return acc
      }, {})
      if (!Object.keys(snapshotCounts).length) return
      const existing = await getPollState(phone, remoteJid, pollId)
      const mergedOptions: Record<string, string> = { ...(existing?.options || {}) }
      for (const vote of pollVotes) {
        const name = `${vote?.optionName || ''}`.trim()
        if (!name) continue
        const hash = this.pollOptionHash(name)
        if (!mergedOptions[hash]) mergedOptions[hash] = name
      }
      const state = {
        ...(existing || {}),
        pollId,
        remoteJid,
        pollName: pollName || `${existing?.pollName || ''}`.trim(),
        options: mergedOptions,
        voters: existing?.voters || {},
        snapshotCounts,
        snapshotTotal: Object.values(snapshotCounts).reduce((sum: number, n: any) => sum + (Number(n) || 0), 0),
        snapshotUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      }
      await setPollState(phone, remoteJid, pollId, state)
      logger.info(
        'Poll snapshot persisted phone=%s remoteJid=%s pollId=%s options=%s total=%s',
        phone,
        remoteJid,
        pollId,
        Object.keys(snapshotCounts).length,
        state.snapshotTotal || 0,
      )
    } catch (e) {
      logger.warn(e as any, 'Failed to persist poll snapshot state')
    }
  }

  private async resolvePollVoterLabel(phone: string, store: any, voterJid: string) {
    try {
      let displayName = ''
      try {
        const info = await store?.dataStore?.getContactInfo?.(voterJid)
        displayName = `${info?.name || ''}`.trim()
      } catch {}
      if (!displayName) {
        try {
          displayName = `${await store?.dataStore?.getContactName?.(voterJid) || ''}`.trim()
        } catch {}
      }
      if (!displayName && voterJid.endsWith('@lid')) {
        try {
          const mappedPn = await store?.dataStore?.getPnForLid?.(phone, voterJid)
          if (mappedPn) {
            displayName = `${await store?.dataStore?.getContactName?.(mappedPn) || ''}`.trim()
          }
        } catch {}
      }
      const phoneDigits = `${jidToPhoneNumber(voterJid, '').replace('+', '') || ''}`.trim()
      if (displayName && phoneDigits) return `${displayName} (${phoneDigits})`
      if (displayName) return displayName
      if (phoneDigits) return phoneDigits
      return `${voterJid || ''}`.split('@')[0]
    } catch {
      return `${voterJid || ''}`.split('@')[0]
    }
  }

  private async buildPollUpdateSummary(phone: string, store: any, message: WAMessage): Promise<string | undefined> {
    try {
      const pollUpdate: any = (message as any)?.message?.pollUpdateMessage || {}
      const pollKey: any = pollUpdate?.pollCreationMessageKey || {}
      const pollId = `${pollKey?.id || ''}`.trim()
      let remoteJid = `${pollKey?.remoteJid || (message as any)?.key?.remoteJid || ''}`.trim()
      if (!pollId || !remoteJid) return undefined
      try { remoteJid = jidNormalizedUser(remoteJid as any) as string } catch {}

      let state: any = await getPollState(phone, remoteJid, pollId)
      if (!state) {
        const pollMessage: any = await store?.dataStore?.loadMessage?.(remoteJid, pollId)
        const creation = pollMessage?.message?.pollCreationMessage
          || pollMessage?.message?.pollCreationMessageV2
          || pollMessage?.message?.pollCreationMessageV3
          || pollMessage?.message?.pollCreationMessageV5
        const options = Array.isArray(creation?.options) ? creation.options : []
        state = {
          pollId,
          remoteJid,
          pollName: `${creation?.name || ''}`.trim(),
          options: options.reduce((acc: Record<string, string>, option: any) => {
            const name = `${option?.optionName || ''}`.trim()
            if (!name) return acc
            acc[this.pollOptionHash(name)] = name
            return acc
          }, {}),
          voters: {},
          updatedAt: Date.now(),
        }
      }
      if (!state || !state.options || !Object.keys(state.options).length) return undefined

      const voterJidRaw = `${(message as any)?.key?.participant || (message as any)?.key?.remoteJid || ''}`.trim()
      if (!voterJidRaw) return undefined
      let voterJid = voterJidRaw
      try { voterJid = jidNormalizedUser(voterJidRaw as any) as string } catch {}

      const selected = Array.isArray(pollUpdate?.vote?.selectedOptions) ? pollUpdate.vote.selectedOptions : []
      const selectedHashes = selected
        .map((v: any) => (v?.toString ? v.toString() : `${v || ''}`))
        .filter((v: string) => !!v)

      state.voters = state.voters || {}
      if (selectedHashes.length) {
        state.voters[voterJid] = selectedHashes
      } else {
        delete state.voters[voterJid]
      }
      state.updatedAt = Date.now()
      await setPollState(phone, remoteJid, pollId, state)

      let optionHashes = Object.keys(state.options || {})
      const counts = optionHashes.reduce((acc: Record<string, number>, h: string) => {
        acc[h] = 0
        return acc
      }, {})
      const voters = Object.entries(state.voters || {}) as Array<[string, string[]]>
      for (const [, hashes] of voters) {
        for (const hash of hashes || []) {
          counts[hash] = (counts[hash] || 0) + 1
        }
      }
      let totalVotes = voters.length
      let usedSnapshot = false
      const snapshotCounts = state?.snapshotCounts || {}
      if (totalVotes === 0 && Object.keys(snapshotCounts).length) {
        usedSnapshot = true
        for (const [hash, count] of Object.entries(snapshotCounts)) {
          counts[hash] = Number(count) || 0
        }
        optionHashes = Array.from(new Set([...optionHashes, ...Object.keys(snapshotCounts)]))
        totalVotes = optionHashes.reduce((sum, hash) => sum + (counts[hash] || 0), 0)
      }
      if (usedSnapshot) {
        logger.info(
          'Poll summary using snapshot fallback phone=%s remoteJid=%s pollId=%s totalVotes=%s',
          phone,
          remoteJid,
          pollId,
          totalVotes,
        )
      }
      const optionLines = optionHashes.map((hash) => `- ${(state.options && state.options[hash]) ? state.options[hash] : hash}: ${counts[hash] || 0}`)
      const voterLabels = await Promise.all(voters.map(async ([jid]) => this.resolvePollVoterLabel(phone, store, jid)))
      const voterLines = voterLabels.filter(Boolean).map((label) => `- ${label}`)
      if (!voterLines.length) {
        voterLines.push(usedSnapshot ? '- Snapshot sem lista nominal de votantes' : '- Ninguem ainda')
      }
      const lines = [
        `*Resultado de enquete*${state.pollName ? `: ${state.pollName}` : ''}`,
        `Total de votos: ${totalVotes}`,
        ...optionLines,
        'Votaram:',
        ...(voterLines.length ? voterLines : ['- Ninguém ainda']),
      ]
      return lines.join('\n')
    } catch (e) {
      logger.warn(e as any, 'Failed to build poll update summary')
      return undefined
    }
  }

  private async cacheOwnStatusMedia(
    phone: string,
    store: any,
    message: WAMessage,
    messageType: string,
    originalBaileysId?: string,
  ) {
    try {
      const key: any = (message as any)?.key || {}
      const remoteJid = `${key?.remoteJid || ''}`
      const fromMe = !!key?.fromMe
      if (remoteJid !== 'status@broadcast' || !fromMe) return
      if (!STATUS_MEDIA_TYPES.has(`${messageType || ''}`)) return
      const media: any = getBinMessage(message as any)?.message || (message as any)?.message?.[messageType] || {}
      const mediaUrl = `${media?.url || ''}`.trim()
      if (!mediaUrl) return
      const currentId = `${key?.id || ''}`.trim()
      if (!currentId) return
      let providerId = ''
      try { providerId = `${await store?.dataStore?.loadProviderId?.(currentId) || ''}`.trim() } catch {}
      if (!providerId) providerId = `${originalBaileysId || ''}`.trim() || currentId
      const state = {
        id: providerId,
        type: messageType,
        url: mediaUrl,
        mimeType: `${media?.mimetype || ''}`.trim(),
        fileName: `${media?.fileName || ''}`.trim(),
        caption: `${media?.caption || ''}`.trim(),
        timestamp: Number((message as any)?.messageTimestamp || Math.floor(Date.now() / 1000)),
      }
      await setStatusMediaState(phone, providerId, state, STATUS_MEDIA_TTL_SEC)
      if (currentId && currentId !== providerId) {
        await setStatusMediaState(phone, currentId, state, STATUS_MEDIA_TTL_SEC)
      }
      try { logger.info('STATUS_MEDIA cached id=%s type=%s url=%s', providerId, messageType, mediaUrl) } catch {}
    } catch (e) {
      logger.warn(e as any, 'Failed to cache own status media')
    }
  }

  private async resolveStatusMediaById(phone: string, store: any, statusId: string): Promise<any | undefined> {
    if (!statusId) return undefined
    let state = await getStatusMediaState(phone, statusId)
    if (!state) return undefined
    if (state?.url) return state
    try {
      const statusMessage: any = await store?.dataStore?.loadMessage?.('status@broadcast', statusId)
      if (statusMessage && isSaveMedia(statusMessage)) {
        const enriched = await store?.mediaStore?.saveMedia?.(statusMessage)
        const mt = getMessageType(enriched as any)
        const media: any = (mt && (enriched as any)?.message?.[mt]) || getBinMessage(enriched as any)?.message || {}
        const mediaUrl = `${media?.url || ''}`.trim()
        if (mediaUrl) {
          state = {
            ...state,
            type: state?.type || mt,
            url: mediaUrl,
            mimeType: state?.mimeType || `${media?.mimetype || ''}`.trim(),
            fileName: state?.fileName || `${media?.fileName || ''}`.trim(),
            caption: state?.caption || `${media?.caption || ''}`.trim(),
          }
          await setStatusMediaState(phone, statusId, state, STATUS_MEDIA_TTL_SEC)
          return state
        }
      }
    } catch (e) {
      logger.warn(e as any, 'Failed to hydrate status media for %s', statusId)
    }
    return state
  }

  private async buildStatusReplyContext(
    phone: string,
    store: any,
    message: WAMessage,
    rawStanzaId?: string,
  ): Promise<any | undefined> {
    try {
      const normalized = getBinMessage(message as any)
      const currentStanza = `${normalized?.message?.contextInfo?.stanzaId || ''}`.trim()
      const candidates = new Set<string>()
      if (rawStanzaId) candidates.add(`${rawStanzaId}`.trim())
      if (currentStanza) candidates.add(currentStanza)
      for (const baseId of Array.from(candidates).filter(Boolean)) {
        const ids = new Set<string>([baseId])
        try {
          const uno = await store?.dataStore?.loadUnoId?.(baseId)
          if (uno) ids.add(`${uno}`)
        } catch {}
        try {
          const provider = await store?.dataStore?.loadProviderId?.(baseId)
          if (provider) ids.add(`${provider}`)
        } catch {}
        for (const id of Array.from(ids).filter(Boolean)) {
          const state = await this.resolveStatusMediaById(phone, store, id)
          if (state?.url) {
            return {
              id: `${state?.id || id}`,
              type: `${state?.type || ''}`,
              caption: `${state?.caption || ''}`,
              timestamp: state?.timestamp,
              media: {
                url: `${state?.url || ''}`,
                mime_type: `${state?.mimeType || ''}`,
                file_name: `${state?.fileName || ''}`,
              },
            }
          }
        }
      }
    } catch (e) {
      logger.warn(e as any, 'Failed to build status reply context')
    }
    return undefined
  }

  async process(phone: string, messages: object[], type: eventType) {
    logger.debug('Received %s(s) %s', type, messages.length, phone)
    if (type == 'delete' && messages.keys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages = (messages.keys as any).map((key: any) => {
        return { key, update: { status: 'DELETED' } }
      })
    }
    const config = await this.getConfig(phone)
    // Evita duplicação comum de eventos 'append' com status PENDING
    if (type === 'append') {
      // filter self message send with this session to not send same message many times
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages = messages.filter((m: any) => !['PENDING', 1, '1'].includes(m?.status))
      if (!messages.length) {
        logger.debug('ignore messages.upsert type append with status pending')
        return
      }
    } else if (type == 'qrcode') {
      await this.broadcast.send(
        phone,
        type,
        messages[0]['message']['imageMessage']['url']
      )
      // await this.broadcast.send(
      //   phone,
      //   'status',
      //   messages[0]['message']['imageMessage']['caption']
      // )
    } else if(type === 'status') {
      await this.broadcast.send(
        phone,
        type,
        messages[0]['message']['conversation']
      )
      // Não propagar notificações internas como mensagens para webhooks
      return
    }
    const getFilterMessageType = (m: any) => {
      // Prefer normalized content to catch wrappers (ephemeral/viewOnce/deviceSent)
      try {
        const normalized = normalizeMessageContent(m?.message)
        const mt = getMessageType({ message: normalized })
        if (mt) return mt
      } catch {}
      try {
        const inner =
          m?.message?.deviceSentMessage?.message ||
          m?.update?.message?.deviceSentMessage?.message
        if (inner) return getMessageType({ message: inner })
      } catch {}
      return getMessageType(m)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredMessages = messages.filter((m: any) => {
      const mt = getFilterMessageType(m)
      return (
        m?.key?.remoteJid &&
        (['qrcode', 'status'].includes(type) ||
          (!config.shouldIgnoreJid(m.key.remoteJid) && !config.shouldIgnoreKey(m.key, mt)))
      )
    })
    logger.debug('%s filtereds messages/updates of %s', messages.length - filteredMessages.length, messages.length)
    await Promise.all(filteredMessages.map(async (m: object) => this.sendOne(phone, m)))
  }

  public async sendOne(phone: string, message: object) {
    try {
      const k: any = (message as any)?.key || {}
      const type = getMessageType(message)
      logger.debug(`Listener receive message (jid=%s id=%s type=%s)`, k?.remoteJid, k?.id, type)
    } catch {
      logger.debug('Listener receive message')
    }
    let i: WAMessage = message as WAMessage
    const originalBaileysMessageId = `${(message as any)?.key?.id || ''}`.trim()
    let messageType = getMessageType(message)
    if (messageType && ['listMessage', 'buttonsMessage', 'interactiveMessage'].includes(messageType)) {
      try {
        const k: any = (i as any)?.key || {}
        logger.info('INTERACTIVE in: jid=%s id=%s type=%s fromMe=%s', k?.remoteJid, k?.id, messageType, k?.fromMe)
      } catch {}
    }
    logger.debug(`messageType %s...`, messageType)
    // Deduplicação leve para mensagens (não afeta 'update'/'receipt')
    try {
      if (messageType && !['update', 'receipt'].includes(`${messageType}`)) {
        const id = i?.key?.id
        const jid = i?.key?.remoteJid
        if (id && jid) {
          const now = Date.now()
          const key = `${jid}|${id}`
          const last = ListenerBaileys.seen.get(key) || 0
          if (now - last < INBOUND_DEDUP_WINDOW_MS) {
            logger.debug('Dedup skip for %s within %sms', key, INBOUND_DEDUP_WINDOW_MS)
            return
          }
          ListenerBaileys.seen.set(key, now)
          // Best-effort cleanup to bound map size
          if (ListenerBaileys.seen.size > 50000) {
            try {
              const cutoff = now - INBOUND_DEDUP_WINDOW_MS * 2
              for (const [k, ts] of ListenerBaileys.seen) {
                if (ts < cutoff) ListenerBaileys.seen.delete(k)
              }
            } catch {}
          }
        }
      }
    } catch {}
    const config = await this.getConfig(phone)
    const store = await config.getStore(phone, config)
    const shouldSkipMediaPersist = (m: WAMessage) => {
      try {
        const msgType = getMessageType(m as any)
        const protocolType = (m as any)?.message?.protocolMessage?.type
        if (msgType === 'protocolMessage' || protocolType === 'HISTORY_SYNC_NOTIFICATION' || protocolType === 'APP_STATE_SYNC_KEY_SHARE') {
          return true
        }
        const bin = getBinMessage(m as any)
        const media: any = bin?.message
        if (!media) return false
        const hasMediaKey = !!media.mediaKey
        const hasDirectPath = !!media.directPath
        const url = `${media.url || ''}`
        const hasHttpUrlOnly = !!url && /^https?:\/\//i.test(url) && !hasMediaKey && !hasDirectPath
        const isQrCaption = `${media.caption || ''}`.toLowerCase().includes('read the qr code')
        if (hasHttpUrlOnly || isQrCaption) return true
      } catch {}
      return false
    }
    // Se o evento vier como 'update' mas contiver conteúdo de mensagem (caso comum em upsert/notify),
    // preferimos tratar como mensagem real para não suprimir o webhook.
    try {
      const hasMessage = !!(i as any)?.message && Object.keys((i as any)?.message || {}).length > 0
      if (hasMessage && messageType === 'update') {
        const clone: any = { ...(i as any) }
        try { delete clone.status } catch {}
        try { delete clone.update } catch {}
        i = clone as WAMessage
        messageType = getMessageType(i)
      }
    } catch {}
    if (messageType && !['update', 'receipt'].includes(messageType)) {
      i = await config.getMessageMetadata(i)
      if (i.key && i.key) {
        const idBaileys = i.key.id!
        let idUno = await store?.dataStore.loadUnoId(idBaileys)
        if (!idUno) {
          idUno = uuid()
          logger.debug('Generated new unoapi id %s for %s', idUno, idBaileys)
        } else {
          logger.debug('Reusing unoapi id %s for %s', idUno, idBaileys)
        }
        await store?.dataStore.setUnoId(idBaileys, idUno)
        await store?.dataStore.setKey(idUno, i.key)
        await store?.dataStore.setKey(idBaileys, i.key)
        await store.dataStore.setMessage(i.key.remoteJid!, i)
        i.key.id = idUno
        if (isSaveMedia(i)) {
          if (shouldSkipMediaPersist(i)) {
            logger.debug('Skipping media persistence for system/non-downloadable payload id=%s', i?.key?.id)
          } else {
            logger.debug(`Saving media...`)
            i = await store?.mediaStore.saveMedia(i)
            logger.debug(`Saved media!`)
          }
        }
      }
    } else if (messageType === 'update') {
      try {
        // Forçar exists() via getMessageMetadata quando inbound 1:1 LID em eventos de status
        const k: any = (i as any)?.key || {}
        const lidRemote = typeof k?.remoteJid === 'string' && k.remoteJid.endsWith('@lid')
        const lidParticipant = typeof k?.participant === 'string' && k.participant.endsWith('@lid')
        if (lidRemote || lidParticipant) {
          i = await config.getMessageMetadata(i)
        }
      } catch {}
      // Normaliza lastIncoming para usar sempre o id do provedor (Baileys)
      try {
        if (i?.key?.remoteJid && i?.key?.id && !i?.key?.fromMe) {
          const original = await (await config.getStore(phone, config))?.dataStore?.loadKey?.(i.key.id)
          if (original && (original as any).id && (original as any).remoteJid) {
            await (await config.getStore(phone, config))?.dataStore?.setLastIncomingKey?.((original as any).remoteJid, original as any)
            try { logger.debug('READ_ON_REPLY: normalized lastIncoming %s -> %s (provider id)', (original as any).remoteJid, (original as any).id) } catch {}
          }
        }
      } catch {}
    }

    const key = i.key
    // possible update message or delete message
    if (key?.id && (key?.fromMe || (!key?.fromMe && ((message as any)?.update?.messageStubType == 1)))) {
      const idUno = await store.dataStore.loadUnoId(key.id)
      logger.debug('Unoapi id %s to Baileys id %s', idUno, key.id)
      if (idUno) {
        i.key.id = idUno
      }
    }

    try {
      await this.savePollCreationState(phone, store, i, messageType || '')
    } catch {}
    try {
      await this.savePollSnapshotState(phone, i, messageType || '')
    } catch {}
    try {
      await this.cacheOwnStatusMedia(phone, store, i, messageType || '', originalBaileysMessageId)
    } catch {}
    // receipt: map provider id -> UNO id to keep status correlation
    if (messageType === 'receipt' && key?.id) {
      try {
        const idUno = await store.dataStore.loadUnoId(key.id)
        if (idUno) {
          logger.debug('Unoapi receipt id %s to Baileys id %s', idUno, key.id)
          i.key.id = idUno
        }
      } catch {}
    }

    // reaction
    if (i?.message?.reactionMessage?.key?.id) {
      const reactionId = i?.message?.reactionMessage?.key?.id
      const unoReactionId = await store.dataStore.loadUnoId(reactionId)
      if (unoReactionId) {
        logger.debug('Unoapi reaction id %s to Baileys reaction id %s', unoReactionId, reactionId)
        i.message.reactionMessage.key.id = unoReactionId
      } else {
        logger.debug('Unoapi reaction id %s not overrided', reactionId)
      }
    }

    // quoted
    const binMessage = messageType && i.message && i.message[messageType]
    const stanzaId = binMessage?.contextInfo?.stanzaId
    const rawStanzaId = `${stanzaId || ''}`.trim()
    if (messageType && i.message && stanzaId) {
      const unoStanzaId = await store.dataStore.loadUnoId(stanzaId)
      if (unoStanzaId) {
        logger.debug('Unoapi stanza id %s to Baileys stanza id %s', unoStanzaId, stanzaId)
        i.message[messageType].contextInfo.stanzaId = unoStanzaId
      } else {
        logger.debug('Unoapi stanza id %s not overrided', stanzaId)
      }
    }

    let data
    try {
      const resp = fromBaileysMessageContent(phone, i, config)
      data = resp[0]
      const senderPhone = resp[1]
      const senderId = resp[2]
      const { dataStore } = await config.getStore(phone, config)
      // Atualiza ponteiro da última mensagem recebida por chat (para ler ao responder)
      try {
        if (i?.key?.remoteJid && i?.key?.id && !i?.key?.fromMe) {
          await dataStore.setLastIncomingKey?.(i.key.remoteJid!, i.key)
          logger.debug('READ_ON_REPLY: set lastIncoming %s -> %s', i.key.remoteJid, i.key.id)
        }
      } catch {}
      // wa_id/from are Cloud API phone fields. LID is exposed by the transformer via user_id/from_user_id.
      // Preferir PN bruto do transporte para caches internos/JIDMAP.
      // senderPhone já vem normalizado para webhook e pode inserir o 9º dígito BR.
      let rawTransportPnDigits = ''
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kid: any = (i as any)?.key || {}
        const rawPnCandidates = [
          kid?.participantPn,
          kid?.senderPn,
          (i as any)?.participantPn,
          (i as any)?.participant,
          (i as any)?.participantAlt,
          kid?.participantAlt,
          kid?.remoteJidAlt,
          (!kid?.remoteJid || `${kid.remoteJid}`.includes('@lid')) ? undefined : kid?.remoteJid,
        ]
        for (const candidate of rawPnCandidates) {
          const raw = `${candidate || ''}`.trim()
          if (!raw) continue
          let digits = ''
          try {
            if (raw.includes('@s.whatsapp.net')) digits = jidToRawPhoneNumber(raw, '').replace('+', '')
            else if (/^\+?\d+$/.test(raw)) digits = raw.replace(/\D/g, '')
          } catch {}
          if (digits) {
            rawTransportPnDigits = digits
            break
          }
        }
      } catch {}
      const senderPhoneDigits = (senderPhone || '').replace(/\D/g, '')
      const preferredPnDigits = rawTransportPnDigits || senderPhoneDigits
      // Mapeia PN (apenas dígitos) -> JID reportado pelo evento, sem heurística BR
      try {
        if (preferredPnDigits) { await dataStore.setJidIfNotFound(preferredPnDigits, senderId) }
      } catch {}
      // Se inbound veio de LID, apenas aquece contact-info.
      // O JIDMAP persistente deve ser aquecido exclusivamente a partir do auth cache.
      try {
        const pnDigits = preferredPnDigits
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kid: any = (i as any)?.key || {}
        const lidJid = (typeof kid?.participant === 'string' && kid.participant.includes('@lid')) ? kid.participant
                      : (typeof kid?.remoteJid === 'string' && kid.remoteJid.includes('@lid')) ? kid.remoteJid
                      : (typeof senderId === 'string' && senderId.includes('@lid')) ? senderId
                      : undefined
        // 1) Se já temos PN válido (E.164), usa-o
        if (pnDigits && lidJid && isValidPhoneNumber(pnDigits, true)) {
          try {
            const pnJid = `${pnDigits}@s.whatsapp.net`
            try {
              const rawName = ((i as any)?.verifiedBizName || (i as any)?.pushName || '').toString().trim()
              if (rawName) {
                try { await dataStore.setContactName?.(pnJid, rawName) } catch {}
                try { await dataStore.setContactName?.(lidJid, rawName) } catch {}
                try { await dataStore.setContactInfo?.(pnJid, { name: rawName, pnJid, lidJid, pn: pnDigits }) } catch {}
                try { await dataStore.setContactInfo?.(lidJid, { name: rawName, pnJid, lidJid, pn: pnDigits }) } catch {}
              }
            } catch {}
          } catch {}
        // 2) Caso contrário, em 1:1 LID, tenta derivar PN via cache/normalização (getPnForLid)
        } else if (lidJid) {
          try {
            const pnJid = await dataStore.getPnForLid?.(phone, lidJid)
            if (pnJid && typeof pnJid === 'string' && pnJid.endsWith('@s.whatsapp.net')) {
              const rawName = ((i as any)?.verifiedBizName || (i as any)?.pushName || '').toString().trim()
              if (rawName) {
                try { await dataStore.setContactName?.(pnJid, rawName) } catch {}
                try { await dataStore.setContactName?.(lidJid, rawName) } catch {}
                try { await dataStore.setContactInfo?.(pnJid, { name: rawName, pnJid, lidJid, pn: pnJid.split('@')[0] }) } catch {}
                try { await dataStore.setContactInfo?.(lidJid, { name: rawName, pnJid, lidJid, pn: pnJid.split('@')[0] }) } catch {}
              }
            }
          } catch {}
        }
      } catch {}
    } catch (error) {
      if (error instanceof BindTemplateError) {
        const template = new Template(this.getConfig)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const i: any = message
        data = await template.bind(phone, i.template.name, i.template.components)
      } else if (error instanceof DecryptError) {
        // Se a descriptografia falhar, ainda encaminhamos um payload explicando o erro
        // para que a aplicação possa tratar (ex.: orientar abrir o WhatsApp no telefone)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data = (error as any).getContent?.() || undefined
        } catch {}
        if (!data) {
          throw error
        }
      } else {
        throw error
      }
    } finally {
      // Enriquecer contatos com foto de perfil também em updates/receipts (cache local)
      try {
        if (data && config.sendProfilePicture) {
          const change = (data as any)?.entry?.[0]?.changes?.[0]?.value
          const contact = change?.contacts?.[0]
          const profile = contact?.profile || (contact && (contact.profile = {}))
          if (contact && !profile?.picture) {
            const waId: string = `${contact.wa_id || ''}`.replace('+', '')
            if (waId) {
              const jid = `${waId}@s.whatsapp.net`
              try {
                const url = await store?.dataStore?.getImageUrl(jid)
                if (url) {
                  profile.picture = url
                }
              } catch {}
            }
          }
        }
      } catch (e) {
        logger.warn(e as any, 'Ignore error enriching profile picture on update')
      }
      const state = data?.entry[0]?.changes[0]?.value?.statuses?.[0] || {}
      try {
        if (state?.id && state?.status) {
          try {
            const keyId = `${i?.key?.id || ''}`.trim()
            if (keyId) {
              state.id = keyId
              try { (data as any).entry[0].changes[0].value.statuses[0].id = keyId } catch {}
            }
          } catch {}
          try {
            const rid = `${state?.recipient_id || ''}`.trim()
            if (rid) {
              state.conversation = state.conversation || {}
              state.conversation.id = rid
              try { (data as any).entry[0].changes[0].value.statuses[0].conversation.id = rid } catch {}
            }
          } catch {}
          let id = state.id
          try {
            // Normaliza id do status para UNO id quando houver mapeamento (provider->UNO)
            const mapped = await store?.dataStore?.loadUnoId(id)
            if (mapped && mapped !== id) {
              state.id = mapped
              // também atualiza no payload principal
              try { (data as any).entry[0].changes[0].value.statuses[0].id = mapped } catch {}
              logger.debug('Mapped provider id %s to UNO id %s for status', id, mapped)
              id = mapped
            }
          } catch (e) { logger.debug('No UNO id mapping for %s', id) }
          const status = state.status || 'error'
          // Backfill a missing 'delivered' before 'read' when previous status is not delivered/read
          if (status === 'read') {
            const prev = await store?.dataStore?.loadStatus(id)
            if (prev !== 'delivered' && prev !== 'read') {
              try {
                const deliveredPayload = JSON.parse(JSON.stringify(data))
                deliveredPayload.entry[0].changes[0].value.statuses[0].status = 'delivered'
                await this.outgoing.send(phone, deliveredPayload)
                logger.debug('Emitted backfilled delivered before read for %s', id)
                await store?.dataStore?.setStatus(id, 'delivered')
              } catch (e) {
                logger.warn(e as any, 'Ignore error backfilling delivered before read')
              }
            }
          }
          // NÃO atualiza o status aqui; faremos após decidir enviar (evita auto-duplicata)
        }
      } catch (e) {
        logger.warn(e as any, 'Ignore error preparing status/backfill')
      }
    }
    if (data) {
      try {
        if (messageType === 'pollUpdateMessage') {
          const summary = await this.buildPollUpdateSummary(phone, store, i)
          if (summary) {
            const m = (data as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
            if (m) {
              m.type = 'text'
              m.text = { body: summary }
            }
          }
        }
      } catch (e) {
        logger.warn(e as any, 'Failed to enrich poll update webhook payload')
      }
      try {
        const statusContext = await this.buildStatusReplyContext(phone, store, i, rawStanzaId)
        if (statusContext) {
          const m = (data as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
          if (m) {
            m.context = m.context || {}
            m.context.status = statusContext
            try { logger.info('STATUS_REPLY enriched with status media id=%s', statusContext?.id || '<none>') } catch {}
          }
        }
      } catch (e) {
        logger.warn(e as any, 'Failed to enrich status reply webhook payload')
      }

      try {
        const v: any = (data as any)?.entry?.[0]?.changes?.[0]?.value || {}
        const m = Array.isArray(v.messages) ? v.messages[0] : undefined
        if (m?.type === 'interactive') {
          logger.info(
            'INTERACTIVE out: from=%s to=%s subtype=%s id=%s',
            m.from || '<none>',
            m.to || '<none>',
            m?.interactive?.type || '<none>',
            m?.id || '<none>',
          )
        }
      } catch {}
      // Guardar contra regressão/duplicata de status (não enviar 'sent' após 'delivered' e nem duplicar)
      try {
        const change = (data as any)?.entry?.[0]?.changes?.[0]?.value
        const st = change?.statuses?.[0]
        if (st?.id && st?.status) {
          let sid = st.id
          try {
            const mapped = await store?.dataStore?.loadUnoId(sid)
            if (mapped) { st.id = mapped; sid = mapped }
          } catch {}
          const prev = await store?.dataStore?.loadStatus(sid)
          const rank = (s: string) => ({ failed:0, progress:1, pending:1, sent:2, delivered:3, read:4, deleted:5 }[`${s}`] ?? -1)
          const newR = rank(st.status)
          const oldR = rank(prev || '')
          if (oldR > newR) {
            logger.info('STATUS decision: skip regression prev=%s -> new=%s id=%s', prev || '<none>', st.status, sid)
            return
          }
          if (oldR === newR && prev) {
            logger.info('STATUS decision: skip duplicate prev=new=%s id=%s', prev, sid)
            return
          }
          logger.info('STATUS decision: forward prev=%s -> new=%s id=%s', prev || '<none>', st.status, sid)
        }
      } catch {}
      const response = this.outgoing.send(phone, data)
      // Após enviar com sucesso, persiste o novo status (se existir)
      try {
        const st = (data as any)?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]
        if (st?.id && st?.status) {
          await store?.dataStore?.setStatus(st.id, st.status)
          logger.debug('Persisted status %s for %s', st.status, st.id)
        }
      } catch (e) {
        logger.warn(e as any, 'Ignore error persisting status after send')
      }
      const to = i?.key?.remoteJid
      await delayFunc(phone, to)
      return response
    } else {
      logger.debug(`Not send message type ${messageType} to http phone %s message id %s`, phone, i?.key?.id)
    }
  }
}
