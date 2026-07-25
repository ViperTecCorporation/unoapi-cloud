import type { DataStore } from '../../src/services/data_store'
import { resolveProviderMessageId, resolveUnoMessageId } from '../../src/services/message_id_map'

describe('message id map', () => {
  test('returns undefined when a provider id has no Uno mapping', async () => {
    const store = { loadUnoId: async () => undefined } as Pick<DataStore, 'loadUnoId' | 'loadProviderId'>
    await expect(resolveUnoMessageId(store, 'provider')).resolves.toBeUndefined()
  })

  test('rejects a legacy self-mapping as an absent Uno mapping', async () => {
    const store = { loadUnoId: async (id: string) => id } as Pick<DataStore, 'loadUnoId' | 'loadProviderId'>
    await expect(resolveUnoMessageId(store, 'provider')).resolves.toBeUndefined()
  })

  test('resolves legacy provider to Uno chains', async () => {
    const ids = new Map([['provider', 'generated'], ['generated', 'queue']])
    const store = { loadUnoId: async (id: string) => ids.get(id) } as Pick<DataStore, 'loadUnoId' | 'loadProviderId'>
    await expect(resolveUnoMessageId(store, 'provider')).resolves.toBe('queue')
  })

  test('resolves Uno to provider chains and stops cycles safely', async () => {
    const ids = new Map([['queue', 'generated'], ['generated', 'provider'], ['provider', 'generated']])
    const store = { loadProviderId: async (id: string) => ids.get(id) } as Pick<DataStore, 'loadUnoId' | 'loadProviderId'>
    await expect(resolveProviderMessageId(store, 'queue')).resolves.toBe('provider')
  })
})
