import { createHash } from 'crypto'

const digitsOnly = (v: string) => `${v || ''}`.replace(/\D/g, '')

// Generate a deterministic Meta-like business_account_id (numeric string).
// Keeps backward compatibility by never touching phoneNumberId.
export const generateBusinessAccountId = (phone: string, phoneNumberId = ''): string => {
  const seed = `${digitsOnly(phone)}:${digitsOnly(phoneNumberId)}`
  const hash = createHash('sha1').update(seed || phone).digest('hex')
  let numeric = ''
  for (const c of hash) {
    numeric += `${parseInt(c, 16) % 10}`
  }
  const base = `${numeric}${digitsOnly(phoneNumberId)}${digitsOnly(phone)}1234567890`
  let out = base.slice(0, 15)
  if (!out) out = '100000000000000'
  if (out[0] === '0') out = `1${out.slice(1)}`
  return out
}

