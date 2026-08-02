import { getPhoneByBusinessAccountId, getPhoneByPhoneNumberId } from './redis'

const cleanMetaId = (value: string) => `${value || ''}`.trim()

export const resolveSessionPhoneByMetaId = async (value: string): Promise<string> => {
  const id = cleanMetaId(value)
  if (!id) return ''

  if (!process.env.REDIS_URL) return id.replace('+', '')

  try {
    const byPhoneNumberId = await getPhoneByPhoneNumberId(id)
    if (byPhoneNumberId) return `${byPhoneNumberId}`.replace('+', '')
  } catch {}

  try {
    const byBusinessAccountId = await getPhoneByBusinessAccountId(id)
    if (byBusinessAccountId) return `${byBusinessAccountId}`.replace('+', '')
  } catch {}

  // Meta phone-number and business-account IDs are also numeric. Only treat
  // an unmapped numeric value as a direct session phone after both aliases
  // have been checked.
  return id.replace('+', '')
}
