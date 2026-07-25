import { QueuesController } from '../../src/controllers/queues_controller'

const response = () => {
  const res: any = {
    status: jest.fn(),
    json: jest.fn(),
  }
  res.status.mockReturnValue(res)
  return res
}

const request = (overrides: Record<string, unknown> = {}) => ({
  headers: { authorization: 'Bearer admin-secret' },
  query: {},
  params: {},
  body: {},
  ...overrides,
}) as any

describe('queues controller', () => {
  const manager = {
    listQueues: jest.fn(),
    previewMessages: jest.fn(),
    removeMessages: jest.fn(),
    purgeQueue: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('requires the global admin token', async () => {
    const res = response()
    await new QueuesController(manager as any, 'admin-secret').list(
      request({ headers: { authorization: 'Bearer session-token' } }),
      res,
    )
    expect(res.status).toHaveBeenCalledWith(403)
    expect(manager.listQueues).not.toHaveBeenCalled()
  })

  test('lists queues for an administrator', async () => {
    manager.listQueues.mockResolvedValue([{ name: 'unoapi.outgoing' }])
    const res = response()
    await new QueuesController(manager as any, 'admin-secret').list(request(), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ queues: [{ name: 'unoapi.outgoing' }] })
  })

  test('previews messages with session filter and bounded limit', async () => {
    manager.previewMessages.mockResolvedValue([])
    const res = response()
    await new QueuesController(manager as any, 'admin-secret').preview(
      request({ params: { queue: 'unoapi.outgoing' }, query: { limit: '500', session: '5566' } }),
      res,
    )
    expect(manager.previewMessages).toHaveBeenCalledWith('unoapi.outgoing', 50, '5566')
  })

  test('requires exact queue confirmation before removing messages', async () => {
    const res = response()
    await new QueuesController(manager as any, 'admin-secret').purge(
      request({ params: { queue: 'unoapi.outgoing' }, body: { confirm: 'wrong', count: 1 } }),
      res,
    )
    expect(res.status).toHaveBeenCalledWith(400)
    expect(manager.removeMessages).not.toHaveBeenCalled()
  })

  test('removes one or multiple messages', async () => {
    manager.removeMessages.mockResolvedValue(10)
    const res = response()
    await new QueuesController(manager as any, 'admin-secret').purge(
      request({ params: { queue: 'unoapi.outgoing' }, body: { confirm: 'unoapi.outgoing', count: 10 } }),
      res,
    )
    expect(manager.removeMessages).toHaveBeenCalledWith('unoapi.outgoing', 10)
    expect(res.json).toHaveBeenCalledWith({ queue: 'unoapi.outgoing', purged: true, removed: 10 })
  })

  test('purges every ready message only when explicitly requested', async () => {
    const res = response()
    await new QueuesController(manager as any, 'admin-secret').purge(
      request({ params: { queue: 'unoapi.outgoing' }, body: { confirm: 'unoapi.outgoing', count: 'all' } }),
      res,
    )
    expect(manager.purgeQueue).toHaveBeenCalledWith('unoapi.outgoing')
    expect(manager.removeMessages).not.toHaveBeenCalled()
  })
})
