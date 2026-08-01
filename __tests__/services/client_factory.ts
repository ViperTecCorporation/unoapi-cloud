jest.mock('../../src/services/client_baileys', () => ({ getClientBaileys: jest.fn() }))
jest.mock('../../src/services/client_zapo', () => ({
  ClientZapo: jest.fn().mockImplementation(() => ({ connect: jest.fn().mockResolvedValue(undefined) })),
}))

import { mockDeep } from 'jest-mock-extended'
import { clients } from '../../src/services/client'
import { getClientBaileys } from '../../src/services/client_baileys'
import { ClientZapo } from '../../src/services/client_zapo'
import { defaultConfig } from '../../src/services/config'
import { SendError } from '../../src/services/send_error'
import type { Listener } from '../../src/services/listener'
import { getClientProvider } from '../../src/services/providers/client_factory'

describe('provider client factory', () => {
  beforeEach(() => {
    clients.clear()
    jest.clearAllMocks()
  })

  test('creates Zapo as the default engine for a new session', async () => {
    const args = {
      phone: '5566',
      listener: mockDeep<Listener>(),
      getConfig: async () => ({ ...defaultConfig, provider: undefined }),
      onNewLogin: jest.fn(),
    }

    const client = await getClientProvider(args)

    expect(client).toBeDefined()
    expect(ClientZapo).toHaveBeenCalledTimes(1)
    expect(getClientBaileys).not.toHaveBeenCalled()
  })

  test('creates and caches a Zapo client for a Zapo session', async () => {
    const args = {
      phone: '5577',
      listener: mockDeep<Listener>(),
      getConfig: async () => ({ ...defaultConfig, provider: 'zapo' as const, autoConnect: true }),
      onNewLogin: jest.fn(),
    }

    const first = await getClientProvider(args)
    const second = await getClientProvider(args)

    expect(first).toBe(second)
    expect(ClientZapo).toHaveBeenCalledTimes(1)
    expect(first.connect).toHaveBeenCalledWith(1)
  })

  test('rejects a legacy Baileys session while its runtime is suppressed', async () => {
    const args = {
      phone: '5511',
      listener: mockDeep<Listener>(),
      getConfig: async () => ({ ...defaultConfig, provider: 'baileys' as const }),
      onNewLogin: jest.fn(),
    }

    await expect(getClientProvider(args)).rejects.toThrow(
      'baileys_provider_disabled_deregister_required',
    )
    expect(getClientBaileys).not.toHaveBeenCalled()
  })

  test('keeps one managed Zapo client while another worker owns the session', async () => {
    const conflict = new SendError(409, 'zapo_session_owned_by_another_worker: 5588')
    ;(ClientZapo as unknown as jest.Mock).mockImplementationOnce(() => ({
      connect: jest.fn().mockRejectedValue(conflict),
      disconnect: jest.fn(),
    }))
    const args = {
      phone: '5588',
      listener: mockDeep<Listener>(),
      getConfig: async () => ({ ...defaultConfig, provider: 'zapo' as const, autoConnect: true }),
      onNewLogin: jest.fn(),
    }

    await expect(getClientProvider(args)).rejects.toBe(conflict)
    const managed = clients.get(args.phone)
    await expect(getClientProvider(args)).resolves.toBe(managed)
    expect(ClientZapo).toHaveBeenCalledTimes(1)
  })
})
