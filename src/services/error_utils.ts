export const isTransientBaileysError = (reason: any): boolean => {
  try {
    const msg = `${(reason && (reason.message || reason.msg || reason.toString?.())) || ''}`
      .toLowerCase()
    const statusCode = (reason && (reason.status || reason.statusCode || (reason as any)?.output?.statusCode)) || undefined
    const boomMsg = `${(reason && (reason as any)?.output?.payload?.message) || ''}`.toLowerCase()

    // Common transient/network cases seen from Baileys/libsignal
    if (msg.includes('connection closed')) return true
    if (boomMsg.includes('connection closed')) return true
    if (statusCode === 428) return true // Precondition Required (Boom) used by Baileys on closed socket

    // Some environments surface this as generic Error without boom payload
    if (msg.includes('precondition required')) return true

    return false
  } catch {
    return false
  }
}

