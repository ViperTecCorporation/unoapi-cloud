import type { DataStore } from './data_store'

type IdStore = Pick<DataStore, 'loadUnoId' | 'loadProviderId'>

const resolveChain = async (
  initial: string,
  next: (id: string) => Promise<string | undefined>,
  maxDepth = 8,
) => {
  let current = `${initial || ''}`.trim()
  const seen = new Set<string>()
  let resolved = false
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    if (seen.has(current)) break
    seen.add(current)
    const candidate = `${await next(current) || ''}`.trim()
    if (!candidate) break
    if (candidate === current) return resolved ? current : undefined
    if (seen.has(candidate)) break
    current = candidate
    resolved = true
  }
  return resolved ? current : undefined
}

export const resolveUnoMessageId = (store: IdStore, providerId: string) =>
  resolveChain(providerId, (id) => store.loadUnoId(id))

export const resolveProviderMessageId = (store: IdStore, unoId: string) =>
  resolveChain(unoId, (id) => store.loadProviderId(id))
