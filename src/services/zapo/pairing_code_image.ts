const normalizePairingCode = (value: string) => {
  const normalized = `${value || ''}`.replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (!normalized) throw new Error('pairing_code_is_empty')
  return normalized.match(/.{1,4}/g)?.join(' ') || normalized
}

export async function createPairingCodeImageDataUrl(value: string) {
  const code = normalizePairingCode(value)
  const svg = `
    <svg width="720" height="360" viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg">
      <rect width="720" height="360" rx="32" fill="#111b21"/>
      <text x="360" y="92" text-anchor="middle" fill="#aebac1"
        font-family="Arial, sans-serif" font-size="28">Código de pareamento</text>
      <text x="360" y="210" text-anchor="middle" fill="#ffffff"
        font-family="Arial, sans-serif" font-size="72" font-weight="700" letter-spacing="8">${code}</text>
      <text x="360" y="292" text-anchor="middle" fill="#00a884"
        font-family="Arial, sans-serif" font-size="26">Digite este código no WhatsApp</text>
    </svg>
  `
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
