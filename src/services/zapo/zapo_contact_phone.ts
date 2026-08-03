export const extractContactPhoneNumber = (value?: string): string | undefined => {
  const digits = `${value || ''}`.split('@')[0].split(':')[0].replace(/\D/g, '')
  return digits || undefined
}

export const normalizeContactPhoneNumber = (value?: string): string | undefined => {
  const digits = extractContactPhoneNumber(value)
  if (!digits) return undefined
  if (!digits.startsWith('55') || digits.length !== 12) return digits

  const localNumber = digits.slice(4)
  const isMobile = /^[6-9]/.test(localNumber)
  return isMobile ? `${digits.slice(0, 4)}9${localNumber}` : digits
}

export const normalizeContactPhoneJid = (value?: string): string | undefined => {
  const phoneNumber = normalizeContactPhoneNumber(value)
  return phoneNumber ? `${phoneNumber}@s.whatsapp.net` : undefined
}

export const contactPhoneLookupNumbers = (value?: string): string[] => {
  const rawPhoneNumber = extractContactPhoneNumber(value)
  const normalizedPhoneNumber = normalizeContactPhoneNumber(value)
  const alternateBrazilianPhone = normalizedPhoneNumber?.startsWith('55')
    && normalizedPhoneNumber.length === 13
    && normalizedPhoneNumber.charAt(4) === '9'
    ? `${normalizedPhoneNumber.slice(0, 4)}${normalizedPhoneNumber.slice(5)}`
    : undefined
  return [...new Set(
    [normalizedPhoneNumber, rawPhoneNumber, alternateBrazilianPhone]
      .filter((phoneNumber): phoneNumber is string => !!phoneNumber),
  )]
}
