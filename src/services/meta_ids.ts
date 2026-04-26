import { createHash } from 'crypto'

const digitsOnly = (value: string) => `${value || ''}`.replace(/\D/g, '')

export const generateBusinessAccountId = (phone: string, phoneNumberId = ''): string => {
  const seed = `${digitsOnly(phone)}:${digitsOnly(phoneNumberId)}`
  const hash = createHash('sha1').update(seed || phone).digest('hex')
  let numeric = ''
  for (const char of hash) {
    numeric += `${parseInt(char, 16) % 10}`
  }
  const base = `${numeric}${digitsOnly(phoneNumberId)}${digitsOnly(phone)}1234567890`
  let out = base.slice(0, 15)
  if (!out) out = '100000000000000'
  if (out[0] === '0') out = `1${out.slice(1)}`
  return out
}
