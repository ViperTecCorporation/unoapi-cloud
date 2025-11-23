import { isJidGroup, jidNormalizedUser, jidToPhoneNumber } from '@whiskeysockets/baileys'
import { Client, Contact } from './client'
import { Listener } from './listener'
import { getConfig } from './config'
import { OnNewLogin } from './socket'
import { ClientBaileys } from './client_baileys'
import { ClientForward } from './client_forward'
import logger from './logger'
import { isWindowOpen, openWindow } from './coexistence_window'

const normalizeContact = (to?: string) => {
  const raw = `${to || ''}`.trim()
  if (!raw) return ''
  if (raw.endsWith('@g.us')) return ''
  try {
    if (isJidGroup(raw)) return ''
  } catch {}
  try {
    const normalized = jidNormalizedUser(raw)
    const digits = jidToPhoneNumber(normalized, '').replace('+', '')
    if (digits) return digits
  } catch {}
  const onlyDigits = raw.replace(/\D/g, '')
  return onlyDigits || raw
}

export class ClientCoexistence implements Client {
  private phone: string
  private listener: Listener
  private getConfig: getConfig
  private onNewLogin: OnNewLogin
  private webClient?: ClientBaileys
  private metaClient?: ClientForward
  private webRegistry = new Map<string, Client>()
  // Cache last config check to avoid repeated lookups per send
  private lastMetaConfigOk = false

  constructor(phone: string, listener: Listener, getConfig: getConfig, onNewLogin: OnNewLogin) {
    this.phone = phone
    this.listener = listener
    this.getConfig = getConfig
    this.onNewLogin = onNewLogin
  }

  private async isMetaConfigured() {
    try {
      const cfg = await this.getConfig(this.phone)
      const fwd = (cfg as any)?.webhookForward || {}
      const hasBasics = !!fwd.token && !!fwd.phoneNumberId
      this.lastMetaConfigOk = hasBasics
      return hasBasics
    } catch {
      this.lastMetaConfigOk = false
      return false
    }
  }

  private async ensureClients() {
    if (!this.webClient) {
      this.webClient = new ClientBaileys(this.phone, this.listener, this.getConfig, this.onNewLogin, this.webRegistry)
      this.webRegistry.set(this.phone, this.webClient)
    }
    if (!this.metaClient) {
      this.metaClient = new ClientForward(this.phone, this.getConfig, this.listener)
    }
  }

  async connect(time: number) {
    await this.ensureClients()
    await this.webClient?.connect(time)
    // Só tenta conectar o cliente Meta se houver config básica (token + phoneNumberId)
    if (await this.isMetaConfigured()) {
      try {
        await this.metaClient?.connect(time)
      } catch (e) {
        logger.warn(e as any, 'Ignore meta client connect error for %s', this.phone)
      }
    } else {
      logger.debug('Meta client skipped (no token/phoneNumberId) for %s', this.phone)
    }
  }

  async disconnect() {
    await this.webClient?.disconnect()
    try {
      await this.metaClient?.disconnect()
    } catch (e) {
      logger.debug(e as any, 'Ignore meta client disconnect error for %s', this.phone)
    }
  }

  async logout() {
    await this.webClient?.logout()
    try {
      await this.metaClient?.logout()
    } catch (e) {
      logger.debug(e as any, 'Ignore meta client logout error for %s', this.phone)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(payload: any, options: any = {}) {
    await this.ensureClients()
    const config = await this.getConfig(this.phone)
    // Fallback: if coexistência não está habilitada, mantém comportamento original (web)
    if (!config.coexistenceEnabled) {
      return this.webClient?.send(payload, options)
    }

    const { status, to } = payload || {}
    // Status/update/delete continuam no cliente Web para preservar compatibilidade
    if (status) {
      return this.webClient?.send(payload, options)
    }

    const metaOk = this.lastMetaConfigOk || await this.isMetaConfigured()
    const toStr = `${to || ''}`
    const isGroup = typeof toStr === 'string' && toStr.endsWith('@g.us')
    if (isGroup) {
      return this.webClient?.send(payload, options)
    }

    const contact = normalizeContact(toStr)
    if (!contact) {
      return this.webClient?.send(payload, options)
    }

    const windowOpen = await isWindowOpen(this.phone, contact)
    if (windowOpen && metaOk) {
      try {
        const resp = await this.metaClient?.send(payload, options)
        await openWindow(this.phone, contact, config.coexistenceWindowSeconds, 'meta-outbound')
        return resp
      } catch (e) {
        logger.warn(e as any, 'Meta send failed, falling back to web %s -> %s', this.phone, contact)
        return this.webClient?.send(payload, options)
      }
    }

    // Sem janela: envia pelo Web para abrir conversa sem template
    return this.webClient?.send(payload, options)
  }

  async getMessageMetadata<T>(message: T): Promise<T> {
    await this.ensureClients()
    return this.webClient?.getMessageMetadata(message) ?? message
  }

  async contacts(numbers: string[]): Promise<Contact[]> {
    await this.ensureClients()
    return this.webClient?.contacts(numbers) || []
  }
}
