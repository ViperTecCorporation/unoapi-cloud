const SENSITIVE_KEY = /(authorization|api[-_]?key|access[-_]?token|auth[-_]?token|password|passwd|secret|token)$/i

const redactError = (value: Error, seen: WeakSet<object>): Error => {
  const redacted = new Error(redactLogString(value.message))
  redacted.name = value.name
  redacted.stack = value.stack ? redactLogString(value.stack) : value.stack

  for (const [key, item] of Object.entries(value)) {
    Object.assign(redacted, {
      [key]: SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactObject(item, seen),
    })
  }

  return redacted
}

const redactObject = (value: unknown, seen: WeakSet<object>): unknown => {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (value instanceof Error) return redactError(value, seen)
  if (value instanceof Date || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value
  if (Array.isArray(value)) return value.map((item) => redactObject(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactObject(item, seen),
    ]),
  )
}

export const redactLogString = (value: string): string => value
  .replace(
    /(["']?(?:authorization|api[-_]?key|access[-_]?token|auth[-_]?token|password|passwd|secret|token)["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^"',}\s]+/gi,
    '$1[REDACTED]',
  )
  .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')

export const redactLogValue = (value: unknown): unknown => {
  if (typeof value === 'string') return redactLogString(value)
  return redactObject(value, new WeakSet())
}

export const redactLogArguments = (args: unknown[]): unknown[] => args.map(redactLogValue)
