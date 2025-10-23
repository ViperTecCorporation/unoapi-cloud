import { Outgoing } from './outgoing'
import fetch, { Response, RequestInit } from 'node-fetch'
import { Webhook, getConfig } from './config'
import logger from './logger'
import { completeCloudApiWebHook, isGroupMessage, isOutgoingMessage, isNewsletterMessage, isUpdateMessage, extractDestinyPhone, normalizeWebhookValueIds, jidToPhoneNumber } from './transformer'
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
    // Prefer PN over LID in webhook payloads when mapping is available (last-resort: keep LID)
    try {
      const config = await this.getConfig(phone)
      const store = await config.getStore(phone, config)
      const ds: any = store?.dataStore
      const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
      const toPnIfMapped = async (x?: string): Promise<string> => {
        let val = `${x || ''}`
        if (!val) return val
        if (val.includes('@g.us')) return val
        // If LID and we have a PN mapping, prefer PN digits
        if (val.includes('@lid')) {
          try {
            const mapped = await ds?.getPnForLid?.(phone, val)
            if (mapped) return jidToPhoneNumber(mapped, '')
          } catch {}
          // No cache: derive PN JID from LID and update mapping
          try {
            const normalized = jidNormalizedUser(val)
            if (normalized && isPnUser(normalized as any)) {
              try { await ds?.setJidMapping?.(phone, normalized as any, val) } catch {}
              return jidToPhoneNumber(normalized, '')
            }
          } catch {}
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
