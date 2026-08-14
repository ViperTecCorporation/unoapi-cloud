import { createHash } from 'crypto'

export type PollAggregateState = {
  options?: Record<string, string>
  voters?: Record<string, string[]>
  snapshotCounts?: Record<string, number>
  [key: string]: unknown
}

export const pollOptionHash = (name: string) =>
  createHash('sha256')
    .update(Buffer.from(name || ''))
    .digest('hex')

const legacyPollOptionHash = (name: string) =>
  createHash('sha256')
    .update(Buffer.from(name || ''))
    .digest()
    .toString()

const binaryOptionHash = (value: unknown): string => {
  if (Buffer.isBuffer(value)) return value.toString('hex')
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
  return `${value || ''}`.trim()
}

export const normalizePollAggregateState = <T extends PollAggregateState>(state: T): T => {
  const options: Record<string, string> = {}
  const aliases = new Map<string, string>()

  for (const [storedHash, rawName] of Object.entries(state.options || {})) {
    const name = `${rawName || ''}`.trim()
    if (!name) continue
    const canonicalHash = pollOptionHash(name)
    options[canonicalHash] = name
    aliases.set(storedHash, canonicalHash)
    aliases.set(legacyPollOptionHash(name), canonicalHash)
    aliases.set(canonicalHash, canonicalHash)
  }

  const normalizeKnownHash = (value: unknown) => {
    const hash = binaryOptionHash(value)
    const canonical = aliases.get(hash) || (/^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : '')
    return canonical && options[canonical] ? canonical : ''
  }

  const voters = Object.entries(state.voters || {}).reduce<Record<string, string[]>>((acc, [jid, hashes]) => {
    const normalized = Array.from(new Set((hashes || []).map(normalizeKnownHash).filter(Boolean)))
    if (normalized.length) acc[jid] = normalized
    return acc
  }, {})

  const snapshotCounts = Object.entries(state.snapshotCounts || {}).reduce<Record<string, number>>((acc, [hash, count]) => {
    const canonical = normalizeKnownHash(hash)
    if (canonical) acc[canonical] = Number(count) || 0
    return acc
  }, {})

  return {
    ...state,
    options,
    voters,
    ...(state.snapshotCounts ? { snapshotCounts } : {}),
  }
}

export const selectedPollOptionHashes = (
  vote: { selectedOptions?: readonly unknown[]; selectedOptionNames?: readonly unknown[] } | undefined,
  options: Record<string, string>,
) => {
  const names = Array.isArray(vote?.selectedOptionNames) ? vote.selectedOptionNames.map((name) => `${name || ''}`.trim()).filter(Boolean) : []
  if (names.length) {
    return Array.from(new Set(names.map(pollOptionHash).filter((hash) => !!options[hash])))
  }

  const selected = Array.isArray(vote?.selectedOptions) ? vote.selectedOptions : []
  return Array.from(
    new Set(
      selected
        .map(binaryOptionHash)
        .map((hash) => hash.toLowerCase())
        .filter((hash) => !!options[hash]),
    ),
  )
}
