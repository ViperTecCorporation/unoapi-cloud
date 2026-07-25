const normalizedServer = (server: string): string =>
  server === 'c.us' ? 's.whatsapp.net' : server

export const normalizeWhatsAppJid = (jid?: string): string => {
  const value = `${jid || ''}`.trim()
  if (!value.includes('@')) return value
  const [local, server = ''] = value.split('@')
  return `${local.split(':')[0]}@${normalizedServer(server.toLowerCase())}`
}

export const isLidUser = (jid?: string): boolean =>
  normalizeWhatsAppJid(jid).endsWith('@lid')

export const isPnUser = (jid?: string): boolean =>
  normalizeWhatsAppJid(jid).endsWith('@s.whatsapp.net')

export const isJidGroup = (jid?: string): boolean =>
  normalizeWhatsAppJid(jid).endsWith('@g.us')

export const isJidStatusBroadcast = (jid?: string): boolean =>
  normalizeWhatsAppJid(jid) === 'status@broadcast'

export const isJidBroadcast = (jid?: string): boolean =>
  normalizeWhatsAppJid(jid).endsWith('@broadcast')

export const isJidNewsletter = (jid?: string): boolean =>
  normalizeWhatsAppJid(jid).endsWith('@newsletter')

export const jidNormalizedUser = (jid?: string): string =>
  normalizeWhatsAppJid(jid)
