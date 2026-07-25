import { mockDeep } from 'jest-mock-extended'
import type { Listener } from '../../src/services/listener'
import { listenerForProvider } from '../../src/services/providers/listener_selector'

describe('provider listener selector', () => {
  test('selects a provider-specific listener when the facade exposes it', () => {
    const selected = mockDeep<Listener>()
    const listener = mockDeep<Listener>() as Listener & {
      forProvider: jest.Mock
    }
    listener.forProvider = jest.fn().mockReturnValue(selected)

    expect(listenerForProvider(listener, 'zapo')).toBe(selected)
    expect(listener.forProvider).toHaveBeenCalledWith('zapo')
  })

  test('keeps a provider-native listener unchanged', () => {
    const listener = mockDeep<Listener>()

    expect(listenerForProvider(listener, 'zapo')).toBe(listener)
  })
})
