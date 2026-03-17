import { getPhoneByBusinessAccountId, getPhoneByPhoneNumberId } from './redis'

const cleanMetaId = (value: string) => `${value || ''}`.trim()

// Resolve Graph path IDs (phone_number_id or business_account_id) into UNO session phone.
export const resolveSessionPhoneByMetaId = async (value: string): Promise<string> => {
  const id = cleanMetaId(value)
  if (!id) return ''

  // Without Redis, keep legacy behavior and avoid slow connection attempts in tests/dev.
  if (!process.env.REDIS_URL) return id.replace('+', '')

  // Direct session-phone path stays untouched for backward compatibility.
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
