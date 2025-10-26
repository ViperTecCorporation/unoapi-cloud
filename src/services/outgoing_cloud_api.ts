import { Outgoing } from './outgoing'
import fetch, { Response, RequestInit } from 'node-fetch'
import { Webhook, getConfig } from './config'
import logger from './logger'
import { completeCloudApiWebHook, isGroupMessage, isOutgoingMessage, isNewsletterMessage, isUpdateMessage, extractDestinyPhone, normalizeWebhookValueIds, jidToPhoneNumber, formatJid } from './transformer'
import { WEBHOOK_PREFER_PN_OVER_LID } from '../defaults'
import { jidNormalizedUser, isPnUser } from '@whiskeysockets/baileys'
import { addToBlacklist, isInBlacklist } from './blacklist'
import { PublishOption } from '../amqp'

export class OutgoingCloudApi implements Outgoing {
  private getConfig: getConfig
  private isInBlacklist: isInBlacklist
  private addToBlacklist: addToBlacklist

  constructor(getConfig: getConfig, isInBlacklist: isInBlacklist, addToBlacklist: addToBlacklist) {
    this.getConfig = getConfig
    this.isInBlacklist = isInBlacklist
    this.addToBlacklist = addToBlacklist
  }

  public async formatAndSend(phone: string, to: string, message: object) {
    const data = completeCloudApiWebHook(phone, to, message)
    return this.send(phone, data)
  }

  public async send(phone: string, message: object) {
    const config = await this.getConfig(phone)
    const promises = config.webhooks.map(async (w) => this.sendHttp(phone, w, message))
    await Promise.all(promises)
  }

  public async sendHttp(phone: string, webhook: Webhook, message: object, _options: Partial<PublishOption> = {}) {
    const destinyPhone = await this.isInBlacklist(phone, webhook.id, message)
    if (destinyPhone) {
      logger.info(`Session phone %s webhook %s and destiny phone %s are in blacklist`, phone, webhook.id, destinyPhone)
      return
    }
    if (!webhook.sendGroupMessages && isGroupMessage(message)) {
      logger.info(`Session phone %s webhook %s configured to not send group message for this webhook`, phone, webhook.id)
      return
    }
    if (!webhook.sendNewsletterMessages && isNewsletterMessage(message)) {
      logger.info(`Session phone %s webhook %s configured to not send newsletter message for this webhook`, phone, webhook.id)
      return
    }
    if (isOutgoingMessage(message)) {
      if (webhook.addToBlackListOnOutgoingMessageWithTtl) {
        logger.info(`Session phone %s webhook %s configured to add to blacklist when outgoing message for this webhook`, phone, webhook.id)
        const to = extractDestinyPhone(message, false)
        await this.addToBlacklist(phone, webhook.id, to, webhook.addToBlackListOnOutgoingMessageWithTtl!)
      }
      if (!webhook.sendOutgoingMessages) {
        logger.info(`Session phone %s webhook %s configured to not send outgoing message for this webhook`, phone, webhook.id)
        return
      }
    }
    if (!webhook.sendUpdateMessages && isUpdateMessage(message)) {
      logger.info(`Session phone %s webhook %s configured to not send update message for this webhook`, phone, webhook.id)
      return
    }
    if (!webhook.sendIncomingMessages) {
      logger.info(`Session phone %s webhook %s configured to not send incoming message for this webhook`, phone, webhook.id)
      return
    }
    // Sanitize phone fields ONLY right before sending (do not affect routing decisions)
    try { normalizeWebhookValueIds((message as any)?.entry?.[0]?.changes?.[0]?.value) } catch {}
    // Repair: if 'from'/wa_id/recipient_id are bare digits but we already have a LID mapping in cache,
    // prefer the mapped @lid to avoid inconsistencies (naked LID-digits without suffix)
    try {
      const config = await this.getConfig(phone)
      const store = await config.getStore(phone, config)
      const ds: any = store?.dataStore
      const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
      const toLidIfMapped = async (x?: string): Promise<string> => {
        const val = `${x || ''}`
        if (!val) return val
        if (val.includes('@')) return val
        // digits-only -> try PN JID mapping to LID
        const pnJid = `${val.replace(/\D/g, '')}@s.whatsapp.net`
        try {
          const lid = await ds?.getLidForPn?.(phone, pnJid)
          if (typeof lid === 'string' && lid.endsWith('@lid')) return lid
        } catch {}
        return val
      }
      if (Array.isArray(v.contacts)) {
        for (const c of v.contacts) {
          if (c && typeof c.wa_id === 'string') c.wa_id = await toLidIfMapped(c.wa_id)
        }
      }
      if (Array.isArray(v.messages)) {
        for (const m of v.messages) {
          if (m && typeof m.from === 'string') m.from = await toLidIfMapped(m.from)
        }
      }
      if (Array.isArray(v.statuses)) {
        for (const s of v.statuses) {
          if (s && typeof s.recipient_id === 'string') s.recipient_id = await toLidIfMapped(s.recipient_id)
        }
      }
    } catch {}
    // Optionally convert @lid to PN when explicitly enabled
    if (WEBHOOK_PREFER_PN_OVER_LID) {
      try {
        const config = await this.getConfig(phone)
        const store = await config.getStore(phone, config)
        const ds: any = store?.dataStore
        const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
        const toPnIfMapped = async (x?: string): Promise<string> => {
          let val = `${x || ''}`
          if (!val) return val
          if (val.includes('@g.us')) return val
          // If LID and we have a PN mapping, prefer PN digits; otherwise keep @lid
          if (val.includes('@lid')) {
            // sanitize device suffix (e.g., 1134:18@lid -> 1134@lid) to maximize cache hit
            let base = val
            try { base = formatJid(val) } catch {}
            try {
              const mapped = (await ds?.getPnForLid?.(phone, base)) || (await ds?.getPnForLid?.(phone, val))
              // Somente converte quando o mapeamento aponta para um PN JID válido
              if (mapped && isPnUser(mapped)) return jidToPhoneNumber(mapped, '')
            } catch {}
            // Fallback: tentar normalizar o LID via Baileys
            try {
              const norm = jidNormalizedUser(base)
              if (norm && isPnUser(norm)) return jidToPhoneNumber(norm, '')
            } catch {}
            return val
          }
          // If PN JID, convert to digits-only PN
          try {
            if (val.includes('@s.whatsapp.net')) return jidToPhoneNumber(val, '')
          } catch {}
          return val
        }
        if (Array.isArray(v.contacts)) {
          for (const c of v.contacts) {
            if (c && typeof c.wa_id === 'string') c.wa_id = await toPnIfMapped(c.wa_id)
          }
        }
        if (Array.isArray(v.messages)) {
          for (const m of v.messages) {
            if (m && typeof m.from === 'string') m.from = await toPnIfMapped(m.from)
          }
        }
        if (Array.isArray(v.statuses)) {
          for (const s of v.statuses) {
            if (s && typeof s.recipient_id === 'string') s.recipient_id = await toPnIfMapped(s.recipient_id)
          }
        }
      } catch {}
    }
    // Enriquecimento do cache de contatos: para cada contato/from, tente preencher pnJid, lidJid e pn
    try {
      const config = await this.getConfig(phone)
      const store = await config.getStore(phone, config)
      const ds: any = store?.dataStore
      const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
      const cleanJid = (j?: string) => {
        if (!j) return ''
        try { return formatJid(j) } catch { return j }
      }
      const ensurePnDigits = (pnJid?: string) => {
        try { return pnJid ? jidToPhoneNumber(pnJid, '').replace('+','') : '' } catch { return '' }
      }
      const enrichOne = async (id?: string, name?: string) => {
        const raw = `${id || ''}`
        if (!raw) return
        let pnJid = ''
        let lidJid = ''
        if (raw.includes('@')) {
          const jid = cleanJid(raw)
          if (jid.toLowerCase().endsWith('@lid')) {
            lidJid = jid
            try { const mapped = await ds?.getPnForLid?.(phone, jid); if (mapped) pnJid = cleanJid(mapped) } catch {}
          } else {
            pnJid = jid
            try { const mapped = await ds?.getLidForPn?.(phone, jid); if (mapped) lidJid = cleanJid(mapped) } catch {}
          }
        } else {
          // digits-only -> assumir PN JID para lookup
          pnJid = `${raw.replace(/\D/g,'')}@s.whatsapp.net`
          try { const mapped = await ds?.getLidForPn?.(phone, pnJid); if (mapped) lidJid = cleanJid(mapped) } catch {}
        }
        if (!pnJid && lidJid) {
          // tentar derivar PN JID a partir de LID normalizado
          try { const mapped = await ds?.getPnForLid?.(phone, lidJid); if (mapped) pnJid = cleanJid(mapped) } catch {}
        }
        if (!pnJid && !lidJid) return
        const pn = ensurePnDigits(pnJid)
        const info: any = { pnJid: pnJid || undefined, lidJid: lidJid || undefined, pn: pn || undefined }
        if (name && typeof name === 'string' && name.trim()) info.name = name
        try { if (pnJid) await ds?.setContactInfo?.(pnJid, info) } catch {}
        try { if (lidJid) await ds?.setContactInfo?.(lidJid, info) } catch {}
        // Refletir também no mapa PN<->LID quando ambos existirem
        if (pnJid && lidJid) { try { await ds?.setJidMapping?.(phone, pnJid, lidJid) } catch {} }
      }
      if (Array.isArray(v.contacts)) {
        for (const c of v.contacts) {
          const name = (c?.profile?.name || '').toString()
          await enrichOne(c?.wa_id, name)
        }
      }
      if (Array.isArray(v.messages)) {
        for (const m of v.messages) {
          await enrichOne(m?.from, undefined)
        }
      }
    } catch {}
    // Heurísticas finais: se ainda restar dígitos "nus" em wa_id/from, tentar extrair @lid do próprio payload
    try {
      const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
      const isDigits = (s?: string) => !!s && /^\d+$/.test(s)
      const clean = (j?: string) => {
        const val = `${j || ''}`
        if (!val) return val
        try { return formatJid(val) } catch { return val }
      }
      const parseLidFromPicture = (url?: string): string | undefined => {
        try {
          const u = `${url || ''}`
          const idx = u.indexOf('/profile-pictures/')
          if (idx >= 0) {
            const rest = u.substring(idx + '/profile-pictures/'.length)
            const name = rest.split('?')[0].split('#')[0]
            const base = decodeURIComponent(name)
            const jid = base.split('.')[0] // e.g., 94047..@lid.jpg
            if (jid && jid.includes('@lid')) return clean(jid)
          }
        } catch {}
        return undefined
      }
      if (Array.isArray(v.contacts)) {
        for (const c of v.contacts) {
          try {
            if (c && typeof c.wa_id === 'string' && isDigits(c.wa_id)) {
              let lid = undefined as string | undefined
              // 1) nome do perfil já vem com @lid em alguns casos
              try {
                const nm = `${c?.profile?.name || ''}`
                if (nm.includes('@lid')) lid = clean(nm)
              } catch {}
              // 2) extrair do link da foto de perfil
              if (!lid) lid = parseLidFromPicture(c?.profile?.picture)
              if (lid && lid.endsWith('@lid')) {
                c.wa_id = lid
              }
            }
          } catch {}
        }
      }
      if (Array.isArray(v.messages) && v.messages.length === 1 && isDigits(v.messages[0]?.from)) {
        try {
          const c = Array.isArray(v.contacts) ? v.contacts[0] : undefined
          if (c && typeof c?.wa_id === 'string' && c.wa_id.includes('@lid')) {
            v.messages[0].from = clean(c.wa_id)
          }
        } catch {}
      }
    } catch {}
    const body = JSON.stringify(message)
    const headers = {
      'Content-Type': 'application/json; charset=utf-8'
    }
    if (webhook.header && webhook.token) {
      headers[webhook.header] = webhook.token
    }
    // Garantir que o endpoint do Chatwoot use o mesmo phone da sessão (metadata.phone_number_id)
    let url = webhook.urlAbsolute || `${webhook.url}/${phone}`
    try {
      const m = url.match(/\/webhooks\/whatsapp\/(\d+)$/)
      if (m && m[1] !== `${phone}`) {
        // Reescreve para URL base + phone
        url = `${webhook.url}/${phone}`
      }
    } catch {}
    logger.debug(`Send url ${url} with headers %s and body %s`, JSON.stringify(headers), body)
    let response: Response
    try {
      const options: RequestInit = { method: 'POST', body, headers }
      if (webhook.timeoutMs) {
        options.signal = AbortSignal.timeout(webhook.timeoutMs)
      }
      response = await fetch(url, options)
    } catch (error) {
      logger.error('Error on send to url %s with headers %s and body %s', url, JSON.stringify(headers), body)
      logger.error(error)
      throw error
    }
    logger.debug('Response: %s', response?.status)
    if (!response?.ok) {
      throw await response?.text()
    }
  }
}
