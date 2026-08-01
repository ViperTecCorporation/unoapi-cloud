const BINARY_MEDIA_FIELDS = new Set(['mediaKey', 'fileSha256', 'fileEncSha256'])

const toUint8Array = (value: unknown): Uint8Array | undefined => {
  if (value instanceof Uint8Array) return value
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry))) {
    return Uint8Array.from(value)
  }
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (record.type === 'Buffer' && Array.isArray(record.data)) {
    return Uint8Array.from(record.data as number[])
  }
  const entries = Object.entries(record)
  if (entries.length && entries.every(([key, entry]) => /^\d+$/.test(key) && Number.isInteger(entry))) {
    return Uint8Array.from(entries.sort(([left], [right]) => Number(left) - Number(right)).map(([, entry]) => entry as number))
  }
  return undefined
}

const toSafeLongNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  if (!Number.isInteger(record.low) || !Number.isInteger(record.high)) return undefined
  const parsed = (Number(record.high) >>> 0) * 0x1_0000_0000 + (Number(record.low) >>> 0)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

export const reviveZapoMediaBinaryFields = (message: unknown): unknown => {
  if (!message || typeof message !== 'object') return message
  for (const [key, value] of Object.entries(message as Record<string, unknown>)) {
    if (BINARY_MEDIA_FIELDS.has(key)) {
      const bytes = toUint8Array(value)
      if (bytes) (message as Record<string, unknown>)[key] = bytes
      continue
    }
    if (key === 'fileLength' || key === 'messageTimestamp') {
      const length = toSafeLongNumber(value)
      if (length !== undefined) (message as Record<string, unknown>)[key] = length
      continue
    }
    reviveZapoMediaBinaryFields(value)
  }
  return message
}
