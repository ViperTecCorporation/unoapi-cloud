import type { RedisTreeNode } from './types.js'

export const redisParentPrefix = (prefix: string): string => {
  const value = `${prefix || ''}`.endsWith(':') ? `${prefix}`.slice(0, -1) : `${prefix || ''}`
  const separator = value.lastIndexOf(':')
  return separator < 0 ? '' : value.slice(0, separator + 1)
}

export const mergeRedisTreeLevel = (
  current: RedisTreeNode[],
  fetched: RedisTreeNode[],
  loadedPrefixes: Set<string>,
): RedisTreeNode[] => {
  const merged = new Map(fetched.map((node) => [node.path, node]))
  current.forEach((node) => {
    if (node.kind === 'branch' && loadedPrefixes.has(node.path) && !merged.has(node.path)) {
      merged.set(node.path, node)
    }
  })
  return [...merged.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'branch' ? -1 : 1
    return left.label.localeCompare(right.label)
  })
}
