const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export const normalizeApiServerUrl = (value, messages = {}) => {
  const candidate = `${value || ''}`.trim()
  if (!candidate) throw new Error(messages.required || 'Informe a URL da instalação')

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error(messages.complete || 'Use uma URL completa, começando com http:// ou https://')
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(messages.safe || 'Use uma URL HTTP ou HTTPS sem credenciais embutidas')
  }

  parsed.search = ''
  parsed.hash = ''
  return parsed.toString().replace(/\/$/, '')
}

export const normalizeAuthorizationValue = (value) => {
  const token = `${value || ''}`.trim()
  if (!token) return ''
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`
}

export const managerOriginFromBrowser = ({ ancestorOrigin = '', referrer = '' } = {}) => {
  for (const candidate of [ancestorOrigin, referrer]) {
    if (!candidate) continue
    try {
      return new URL(candidate).origin
    } catch {}
  }
  return ''
}
