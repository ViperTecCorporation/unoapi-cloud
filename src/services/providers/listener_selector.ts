import type { Listener } from '../listener'

export const listenerForProvider = (
  listener: Listener,
  provider: 'baileys' | 'zapo',
): Listener => {
  const selectable = listener as Listener & {
    forProvider?: (value: 'baileys' | 'zapo') => Listener
  }
  return selectable.forProvider?.(provider) || listener
}
