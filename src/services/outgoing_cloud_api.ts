import { Outgoing } from './outgoing'
import fetch, { Response, RequestInit } from 'node-fetch'
import { Webhook, getConfig } from './config'
import logger from './logger'
import { completeCloudApiWebHook, isGroupMessage, isOutgoingMessage, isNewsletterMessage, isUpdateMessage, extractDestinyPhone, ensurePn, jidToPhoneNumberIfUser } from './transformer'
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
    try {
      const v: any = (message as any)?.entry?.[0]?.changes?.[0]?.value || {}
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
        } catch { return digits }
      }
      const norm = (x?: string) => {
        let val = `${x || ''}`
        // Não normalizar grupos: manter @g.us intacto
        if (val.includes('@g.us')) return val
        // Se vier LID, normaliza para PN
        try {
          if (val.includes('@lid')) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { jidNormalizedUser } = require('@whiskeysockets/baileys')
            val = jidNormalizedUser(val)
          }
        } catch {}
        // Converter JID de usuário para PN quando aplicável
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { jidToPhoneNumberIfUser } = require('./transformer')
          if (!/^\+?\d+$/.test(val)) val = jidToPhoneNumberIfUser(val)
        } catch {}
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { ensurePn } = require('./transformer')
          const direct = ensurePn(val)
          if (direct) return brMobile9(direct)
        } catch {}
        return val
      }
      if (Array.isArray(v.contacts)) {
        for (const c of v.contacts) {
          if (c && typeof c.wa_id === 'string') c.wa_id = norm(c.wa_id)
        }
      }
      if (Array.isArray(v.messages)) {
        for (const m of v.messages) {
          if (m && typeof m.from === 'string') m.from = norm(m.from)
        }
      }
      if (Array.isArray(v.statuses)) {
        for (const s of v.statuses) {
          if (s && typeof s.recipient_id === 'string') s.recipient_id = norm(s.recipient_id)
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
