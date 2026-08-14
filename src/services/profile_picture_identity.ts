const PN_PATTERN = /^\+?(\d{5,20})$/
const PN_JID_PATTERN = /^(\d{5,20})(?::\d+)?@s\.whatsapp\.net$/i
const LID_PATTERN = /^(\d{5,20})(?::\d+)?@lid$/i
const GROUP_PATTERN = /^([0-9-]{5,40})@g\.us$/i

export const normalizeProfilePictureId = (value?: string): string | undefined => {
  const raw = `${value || ''}`.trim()
  if (!raw || raw.length > 96 || raw.includes('..') || raw.includes('/') || raw.includes('\\') || raw.includes('\0')) {
    return undefined
  }

  const pn = raw.match(PN_PATTERN)
  if (pn) return pn[1]

  const pnJid = raw.match(PN_JID_PATTERN)
  if (pnJid) return pnJid[1]

  const lid = raw.match(LID_PATTERN)
  if (lid) return `${lid[1]}@lid`

  const group = raw.match(GROUP_PATTERN)
  if (group) return `${group[1]}@g.us`

  return undefined
}

export const resolveProfilePictureId = (...values: Array<string | undefined>): string | undefined => {
  for (const value of values) {
    const normalized = normalizeProfilePictureId(value)
    if (normalized) return normalized
  }
  return undefined
}
