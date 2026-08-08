import { clients, type Client } from '../../src/services/client'
import { disconnectActiveClients } from '../../src/services/graceful_shutdown'

const fakeClient = (disconnect: jest.Mock): Client => ({
  connect: jest.fn(),
  disconnect,
  logout: jest.fn(),
  send: jest.fn(),
  getMessageMetadata: jest.fn(),
  contacts: jest.fn(),
})

describe('disconnectActiveClients', () => {
  afterEach(() => clients.clear())

  it('disconnects all sessions concurrently and tolerates an individual failure', async () => {
    const first = jest.fn().mockResolvedValue(undefined)
    const second = jest.fn().mockRejectedValue(new Error('disconnect_failed'))
    clients.set('5566999554300', fakeClient(first))
    clients.set('5566996222471', fakeClient(second))

    await expect(disconnectActiveClients()).resolves.toBe(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
