import { eventType, Listener } from './listener'
import logger from './logger'
import { Outgoing } from './outgoing'
import { Broadcast } from './broadcast'
import { getConfig } from './config'
import { fromBaileysMessageContent, getMessageType, BindTemplateError, isSaveMedia, jidToPhoneNumber, DecryptError } from './transformer'
import { WAMessage, delay } from '@whiskeysockets/baileys'
import { Template } from './template'
import { UNOAPI_DELAY_AFTER_FIRST_MESSAGE_MS, UNOAPI_DELAY_BETWEEN_MESSAGES_MS, INBOUND_DEDUP_WINDOW_MS } from '../defaults'
import { v1 as uuid } from 'uuid'

const  delays: Map<String, number> = new Map()

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
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredMessages = messages.filter((m: any) => {
      return (
        m?.key?.remoteJid &&
        (['qrcode', 'status'].includes(type) || (!config.shouldIgnoreJid(m.key.remoteJid) && !config.shouldIgnoreKey(m.key, getMessageType(m))))
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
    const messageType = getMessageType(message)
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
    if (messageType && !['update', 'receipt'].includes(messageType)) {
      i = await config.getMessageMetadata(i)
      if (i.key && i.key) {
        const idUno = uuid()
        const idBaileys = i.key.id!
        await store?.dataStore.setUnoId(idBaileys, idUno)
        await store?.dataStore.setKey(idUno, i.key)
        await store?.dataStore.setKey(idBaileys, i.key)
        await store.dataStore.setMessage(i.key.remoteJid!, i)
        i.key.id = idUno
        if (isSaveMedia(i)) {
          logger.debug(`Saving media...`)
          i = await store?.mediaStore.saveMedia(i)
          logger.debug(`Saved media!`)
        }
      }
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
        }
      } catch {}
      // Mapeia PN (apenas dígitos) -> JID reportado pelo evento, sem heurística BR
      try {
        const pn = (senderPhone || '').replace(/\D/g, '')
        if (pn) { await dataStore.setJidIfNotFound(pn, senderId) }
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
