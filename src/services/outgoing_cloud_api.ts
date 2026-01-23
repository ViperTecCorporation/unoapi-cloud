import { Outgoing } from './outgoing'
import fetch, { Response, RequestInit } from 'node-fetch'
import { Webhook, getConfig } from './config'
import logger from './logger'
import { completeCloudApiWebHook, isGroupMessage, isOutgoingMessage, isNewsletterMessage, isUpdateMessage, extractDestinyPhone, normalizeWebhookValueIds, jidToPhoneNumber, formatJid, isValidPhoneNumber } from './transformer'
import { WEBHOOK_ASYNC, WEBHOOK_PREFER_PN_OVER_LID, WEBHOOK_CB_ENABLED, WEBHOOK_CB_FAILURE_THRESHOLD, WEBHOOK_CB_OPEN_MS, WEBHOOK_CB_FAILURE_TTL_MS, WEBHOOK_CB_REQUEUE_DELAY_MS } from '../defaults'
import { jidNormalizedUser, isPnUser } from '@whiskeysockets/baileys'
import { addToBlacklist, isInBlacklist } from './blacklist'
import { PublishOption } from '../amqp'
import { isWebhookCircuitOpen, openWebhookCircuit, closeWebhookCircuit, bumpWebhookCircuitFailure } from './redis'

class WebhookCircuitOpenError extends Error {
  public code = 'WEBHOOK_CB_OPEN'
  public delayMs: number
  constructor(message: string, delayMs: number) {
    super(message)
    this.delayMs = delayMs
  }
}
// Ajusta payload para schema Cloud API estrito (Typebot)
const normalizePayloadForTypebot = (payload: any, phone: string) => {
  try {
    const data = JSON.parse(JSON.stringify(payload))
    const value = data?.entry?.[0]?.changes?.[0]?.value
    if (value?.messages && Array.isArray(value.messages)) {
      const allowedTypes = new Set(['text', 'image', 'video', 'audio', 'document', 'sticker', 'ptv'])
      value.messages = value.messages.map((m: any) => {
        const mm = { ...m }
        // Descartar tipos nÇœo suportados pelo schema Typebot (ex.: call)
        if (mm.type && !allowedTypes.has(mm.type)) {
          logger.debug('TYPEBOT normalize: dropping unsupported message type %s', mm.type)
          return null
        }
        const mediaTypes = ['image', 'video', 'audio', 'document', 'sticker', 'ptv']
        for (const mt of mediaTypes) {
          if (mm[mt]) {
            const media = { ...mm[mt] }
            const rawId = `${media.id || ''}`
            const cleanUuid = rawId.includes('/') ? rawId.split('/').pop() : rawId
            // Preservar phone no id para poder resolver download: formata phone-uuid
            media.id = cleanUuid ? `${phone}-${cleanUuid}` : (rawId || '')
            if (media.filename !== undefined) delete media.filename
            if (media.url !== undefined) delete media.url
            if (media.sha256 !== undefined) delete media.sha256
            if (media.caption === null) delete media.caption
            // sha256 deve ser string
            try {
              const v = media.sha256
              if (v && typeof v !== 'string') {
                media.sha256 = Buffer.isBuffer(v) ? v.toString('base64') : Buffer.from(v).toString('base64')
              }
            } catch { media.sha256 = undefined }
            mm[mt] = media
          }
        }
        // Forçar id de mensagem apenas como uuid (sem phone/)
        try {
          const raw = `${mm.id || ''}`
          if (raw.includes('/')) mm.id = raw.split('/').pop()
        } catch {}
        return mm
      }).filter(Boolean)
    }
    if (value?.contacts && Array.isArray(value.contacts)) {
      value.contacts = value.contacts.map((c: any) => {
        const cc = { ...c }
        try {
          if (cc.profile && cc.profile.picture !== undefined) {
            delete cc.profile.picture
          }
        } catch {}
        return cc
      })
    }
    if (value?.statuses && Array.isArray(value.statuses)) {
      value.statuses = value.statuses.map((s: any) => {
        const ss = { ...s }
        // id apenas o uuid (sem phone/)
        try {
          const raw = `${ss.id || ''}`
          if (raw.includes('/')) ss.id = raw.split('/').pop()
        } catch {}
        // timestamp como string
        try {
          if (typeof ss.timestamp !== 'string') ss.timestamp = `${ss.timestamp || ''}`
        } catch {}
        // recipient_id somente dígitos
        try {
          if (typeof ss.recipient_id === 'string') ss.recipient_id = ss.recipient_id.replace(/\D/g, '')
        } catch {}
        // errors: manter apenas code/title/message/error_data
        try {
          if (Array.isArray(ss.errors)) {
            ss.errors = ss.errors.map((e: any) => {
              const out: any = {}
              if (typeof e?.code !== 'undefined') out.code = e.code
              if (typeof e?.title !== 'undefined') out.title = e.title
              if (typeof e?.message !== 'undefined') out.message = e.message
              const details =
                (e?.error_data && e.error_data.details) ||
                e?.message ||
                e?.title ||
                ''
              if (details) {
                out.error_data = { details: `${details}` }
              }
              return out
            })
          }
        } catch {}
        return ss
      })
    }
    return data
  } catch (e) {
    logger.warn(e as any, 'Unable to normalize payload for typebot (session=%s)', phone)
    return payload
  }
}

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
    if (WEBHOOK_ASYNC) {
      config.webhooks.forEach((w) => {
        this.sendHttp(phone, w, message).catch((error) => {
          logger.error('WEBHOOK_ASYNC: send failed (phone=%s webhook=%s)', phone, w?.id || '<none>')
          logger.error(error)
        })
      })
      return
    }
    const promises = config.webhooks.map(async (w) => this.sendHttp(phone, w, message))
    await Promise.all(promises)
  }

  public async sendHttp(phone: string, webhook: Webhook, message: any, _options: Partial<PublishOption> = {}) {
    const cbEnabled = !!WEBHOOK_CB_ENABLED && WEBHOOK_CB_FAILURE_THRESHOLD > 0 && WEBHOOK_CB_OPEN_MS > 0
    const cbId = (webhook && (webhook.id || webhook.url || webhook.urlAbsolute)) ? `${webhook.id || webhook.url || webhook.urlAbsolute}` : 'default'
    const cbKey = `${phone}:${cbId}`
    const now = Date.now()
    if (cbEnabled) {
      try {
        const open = process.env.REDIS_URL
          ? await isWebhookCircuitOpen(phone, cbId)
          : isCircuitOpenLocal(cbKey, now)
        if (open) {
          logger.warn('WEBHOOK_CB open: skipping send (phone=%s webhook=%s)', phone, cbId)
          throw new WebhookCircuitOpenError(`WEBHOOK_CB open for ${cbId}`, this.cbRequeueDelayMs())
        }
      } catch {}
    }
    // Clone to avoid cross-webhook mutations
    try { message = JSON.parse(JSON.stringify(message)) } catch {}
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
    const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
    // Garantir que contacts[*].wa_id nunca venha vazio: usar recipient_id ou from como fallback
    try {
      if (Array.isArray(v.contacts) && v.contacts.length > 0) {
        const c = v.contacts[0] || {}
        const raw = (c.wa_id || '').toString().trim()
        if (!raw) {
          let fallback: string | undefined
          try {
            if (Array.isArray(v.statuses) && v.statuses[0]?.recipient_id) {
              fallback = `${v.statuses[0].recipient_id}`
            }
          } catch {}
          try {
            if (!fallback && Array.isArray(v.messages) && v.messages[0]?.from) {
              fallback = `${v.messages[0].from}`
            }
          } catch {}
          if (fallback && fallback.toString().trim()) {
            c.wa_id = fallback.toString().trim()
          }
        }
      }
    } catch {}
    // Sanitize phone fields ONLY right before sending (do not affect routing decisions)
    try { normalizeWebhookValueIds(v) } catch {}
    // Mapping preferences são aplicadas abaixo; digits->LID repair e heurísticas são condicionadas à preferência de LID/PN
    // Repair (when not preferring PN): if 'from'/wa_id/recipient_id are bare digits but we already have a LID mapping in cache,
    // prefer the mapped @lid to avoid inconsistencies (naked LID-digits without suffix)
    if (!WEBHOOK_PREFER_PN_OVER_LID) try {
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
              // Somente converte quando o mapeamento aponta para um PN JID vÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡lido
              if (mapped && isPnUser(mapped)) { const digits = jidToPhoneNumber(mapped, '') .replace('\+',''); if (isValidPhoneNumber(digits, true)) return digits }
            } catch {}
            // TambÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©m tentar via contact-info (pn jÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ resolvido anteriormente)
            try {
              const info = await ds?.getContactInfo?.(base)
              const pnDigits = `${info?.pn || ''}`.replace(/\D/g, '')
              if (pnDigits) return pnDigits
            } catch {}
            // Fallback: normalizar via jidNormalizedUser quando não houver mapping/contact-info
            try {
              const norm = jidNormalizedUser(base)
              if (norm && isPnUser(norm)) {
                const digits = jidToPhoneNumber(norm, '').replace('+','')
                if (isValidPhoneNumber(digits, true)) return digits
              }
            } catch {}
            // Sem mapping nem contact-info confiÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡vel: preserva @lid (nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o gerar dÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­gitos nus)
            return val
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
        // Refletir tambÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â©m no mapa PN<->LID quando ambos existirem
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
    // HeurÃ­sticas finais: somente quando preferimos LID nos webhooks
    if (!WEBHOOK_PREFER_PN_OVER_LID) try {
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
              // 1) nome do perfil jÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ vem com @lid em alguns casos
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
    // Aplicar schema Typebot (Cloud API estrito) se habilitado no webhook
    if (webhook.typebot) {
      message = normalizePayloadForTypebot(message, phone)
    }
    const body = JSON.stringify(message)
    const headers = {
      'Content-Type': 'application/json; charset=utf-8'
    }
    if (webhook.header && webhook.token) {
      headers[webhook.header] = webhook.token
    }
    // Garantir que o endpoint do Chatwoot use o mesmo phone da sessÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o (metadata.phone_number_id)
    let url = webhook.urlAbsolute || `${webhook.url}/${phone}`
    try {
      const m = url.match(/\/webhooks\/whatsapp\/(\d+)$/)
      if (m && m[1] !== `${phone}`) {
        // Reescreve para URL base + phone
        url = `${webhook.url}/${phone}`
      }
    } catch {}
    try {
      const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
      const m = Array.isArray(v.messages) ? v.messages[0] : undefined
      if (m?.type === 'interactive') {
        logger.info(
          'INTERACTIVE webhook: id=%s to=%s subtype=%s url=%s',
          m?.id || '<none>',
          m?.to || '<none>',
          m?.interactive?.type || '<none>',
          url,
        )
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
      if (cbEnabled) {
        const opened = await this.handleCircuitFailure(phone, cbId, cbKey, error as any)
        if (opened) {
          throw new WebhookCircuitOpenError(`WEBHOOK_CB opened for ${cbId}`, this.cbRequeueDelayMs())
        }
      }
      throw error
    }
    logger.debug('Response: %s', response?.status)
    if (!response?.ok) {
      const errText = await response?.text()
      if (cbEnabled) {
        const opened = await this.handleCircuitFailure(phone, cbId, cbKey, errText)
        if (opened) {
          throw new WebhookCircuitOpenError(`WEBHOOK_CB opened for ${cbId}`, this.cbRequeueDelayMs())
        }
      }
      throw errText
    }
    if (cbEnabled) {
      try {
        if (process.env.REDIS_URL) {
          await closeWebhookCircuit(phone, cbId)
        } else {
          resetCircuitLocal(cbKey)
        }
      } catch {}
    }
  }

  private cbRequeueDelayMs() {
    return WEBHOOK_CB_REQUEUE_DELAY_MS || WEBHOOK_CB_OPEN_MS || 120000
  }

  private async handleCircuitFailure(phone: string, cbId: string, cbKey: string, error: any): Promise<boolean> {
    try {
      const threshold = WEBHOOK_CB_FAILURE_THRESHOLD || 1
      const openMs = WEBHOOK_CB_OPEN_MS || 120000
      const ttlMs = WEBHOOK_CB_FAILURE_TTL_MS || openMs
      const count = process.env.REDIS_URL
        ? await bumpWebhookCircuitFailure(phone, cbId, ttlMs)
        : bumpCircuitFailureLocal(cbKey, ttlMs)
      if (count >= threshold) {
        if (process.env.REDIS_URL) {
          await openWebhookCircuit(phone, cbId, openMs)
        } else {
          openCircuitLocal(cbKey, openMs)
        }
        logger.warn('WEBHOOK_CB opened (phone=%s webhook=%s count=%s openMs=%s)', phone, cbId, count, openMs)
        return true
      } else {
        logger.warn('WEBHOOK_CB failure (phone=%s webhook=%s count=%s/%s)', phone, cbId, count, threshold)
        return false
      }
    } catch (e) {
      logger.warn(e as any, 'WEBHOOK_CB failure handler error')
    }
    // Fail fast: do not throw to avoid queue backlog
    try { logger.warn(error as any, 'WEBHOOK_CB send failed (phone=%s webhook=%s)', phone, cbId) } catch {}
    return false
  }
}

const cbOpenUntil: Map<string, number> = new Map()
const cbFailState: Map<string, { count: number; exp: number }> = new Map()

const isCircuitOpenLocal = (key: string, now: number) => {
  const until = cbOpenUntil.get(key)
  if (!until) return false
  if (now >= until) {
    cbOpenUntil.delete(key)
    return false
  }
  return true
}

const openCircuitLocal = (key: string, openMs: number) => {
  cbOpenUntil.set(key, Date.now() + Math.max(1, openMs || 0))
}

const resetCircuitLocal = (key: string) => {
  cbOpenUntil.delete(key)
  cbFailState.delete(key)
}

const bumpCircuitFailureLocal = (key: string, ttlMs: number): number => {
  const now = Date.now()
  const ttl = Math.max(1, ttlMs || 0)
  const current = cbFailState.get(key)
  if (!current || now >= current.exp) {
    cbFailState.set(key, { count: 1, exp: now + ttl })
    return 1
  }
  current.count += 1
  return current.count
}
