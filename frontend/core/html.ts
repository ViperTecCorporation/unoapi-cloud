export const escapeHtml = (value: unknown): string =>
  `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const safeImageUrl = (value: unknown): string => {
  const url = `${value ?? ''}`.trim()
  if (!url) return ''
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(url)) return url
  try {
    const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const parsed = new URL(url, baseUrl)
    return ['http:', 'https:', 'blob:'].includes(parsed.protocol) ? parsed.href : ''
  } catch {
    return ''
  }
}

export const digitsOnly = (value: unknown): string => `${value ?? ''}`.replace(/\D/g, '')

export const messageRecipient = (value: unknown): string => {
  const recipient = `${value ?? ''}`.trim()
  return recipient.includes('@') ? recipient : digitsOnly(recipient)
}
