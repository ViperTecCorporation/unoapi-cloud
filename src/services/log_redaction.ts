const SENSITIVE_KEY = /(authorization|api[-_]?key|access[-_]?token|auth[-_]?token|password|passwd|secret|token|credential[-_]?id|digitable[-_]?line)$/i

const isSensitiveKey = (key: string, parentKey?: string) =>
  SENSITIVE_KEY.test(key) ||
  (['pix_dynamic_code', 'pix_static_code'].includes(`${parentKey || ''}`.toLowerCase()) && /^(code|key)$/i.test(key)) ||
  (`${parentKey || ''}`.toLowerCase() === 'copy_code' && /^code$/i.test(key))

const redactError = (value: Error, seen: WeakSet<object>): Error => {
  const redacted = new Error(redactLogString(value.message))
  redacted.name = value.name
  redacted.stack = value.stack ? redactLogString(value.stack) : value.stack

  for (const [key, item] of Object.entries(value)) {
    Object.assign(redacted, {
      [key]: isSensitiveKey(key) ? '[REDACTED]' : redactObject(item, seen, key),
    })
  }

  return redacted
}

const redactObject = (value: unknown, seen: WeakSet<object>, parentKey?: string): unknown => {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (value instanceof Error) return redactError(value, seen)
  if (value instanceof Date || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value
  if (Array.isArray(value)) return value.map((item) => redactObject(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key, parentKey) ? '[REDACTED]' : redactObject(item, seen, key),
    ]),
  )
}

export const redactLogString = (value: string): string => value
  .replace(
    /(["']?(?:authorization|api[-_]?key|access[-_]?token|auth[-_]?token|password|passwd|secret|token|credential[-_]?id|digitable[-_]?line)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^"',}\s]+/gi,
    '$1[REDACTED]',
  )
  .replace(
    /(["']?pix_(?:dynamic|static)_code["']?\s*:\s*\{[^{}]*?["']?code["']?\s*:\s*["']?)[^"',}\s]+/gi,
    '$1[REDACTED]',
  )
  .replace(
    /(["']?pix_(?:dynamic|static)_code["']?\s*:\s*\{[^{}]*?["']?key["']?\s*:\s*["']?)[^"',}\s]+/gi,
    '$1[REDACTED]',
  )
  .replace(
    /(["']?copy_code["']?\s*:\s*\{[^{}]*?["']?code["']?\s*:\s*["']?)[^"',}\s]+/gi,
    '$1[REDACTED]',
  )
  .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')

export const redactLogValue = (value: unknown): unknown => {
  if (typeof value === 'string') return redactLogString(value)
  return redactObject(value, new WeakSet())
}

export const redactLogArguments = (args: unknown[]): unknown[] => args.map(redactLogValue)
