import { getPhoneByBusinessAccountId, getPhoneByPhoneNumberId } from './redis'

const cleanMetaId = (value: string) => `${value || ''}`.trim()

export const resolveSessionPhoneByMetaId = async (value: string): Promise<string> => {
  const id = cleanMetaId(value)
  if (!id) return ''

  if (!process.env.REDIS_URL) return id.replace('+', '')

  if (/^\+?\d{8,15}$/.test(id)) return id.replace('+', '')

  try {
    const byPhoneNumberId = await getPhoneByPhoneNumberId(id)
    if (byPhoneNumberId) return `${byPhoneNumberId}`.replace('+', '')
  } catch {}

  try {
    const byBusinessAccountId = await getPhoneByBusinessAccountId(id)
    if (byBusinessAccountId) return `${byBusinessAccountId}`.replace('+', '')
  } catch {}

  return id
}
