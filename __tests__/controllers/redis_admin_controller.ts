import { RedisAdminController } from '../../src/controllers/redis_admin_controller'

const res = () => {
  const value: any = { status: jest.fn(), json: jest.fn() }
  value.status.mockReturnValue(value)
  return value
}
const req = (overrides: Record<string, unknown> = {}) => ({
  headers: { authorization: 'Bearer admin' },
  query: {},
  params: {},
  body: {},
  ...overrides,
}) as any

describe('Redis admin controller', () => {
  const manager = {
    listKeys: jest.fn(),
    getKey: jest.fn(),
    saveKey: jest.fn(),
    deleteKey: jest.fn(),
    query: jest.fn(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('rejects non-admin tokens', async () => {
    const response = res()
    await new RedisAdminController(manager as any, 'admin').list(req({ headers: { authorization: 'Bearer session' } }), response)
    expect(response.status).toHaveBeenCalledWith(403)
  })

  test('lists and reads Redis keys', async () => {
    manager.listKeys.mockResolvedValue(['unoapi:test'])
    manager.getKey.mockResolvedValue({ key: 'unoapi:test', type: 'string' })
    const controller = new RedisAdminController(manager as any, 'admin')
    const listResponse = res()
    await controller.list(req({ query: { search: 'test', limit: '20' } }), listResponse)
    expect(manager.listKeys).toHaveBeenCalledWith('test', 20)
    const getResponse = res()
    await controller.get(req({ params: { key: 'unoapi:test' } }), getResponse)
    expect(getResponse.status).toHaveBeenCalledWith(200)
  })

  test('requires exact confirmation before saving or deleting', async () => {
    const controller = new RedisAdminController(manager as any, 'admin')
    await controller.save(req({ params: { key: 'unoapi:test' }, body: { confirm: 'wrong' } }), res())
    await controller.remove(req({ params: { key: 'unoapi:test' }, body: { confirm: 'wrong' } }), res())
    expect(manager.saveKey).not.toHaveBeenCalled()
    expect(manager.deleteKey).not.toHaveBeenCalled()
  })

  test('runs allowlisted queries through the service', async () => {
    manager.query.mockResolvedValue('string')
    const response = res()
    await new RedisAdminController(manager as any, 'admin').query(
      req({ body: { command: 'TYPE', args: ['unoapi:test'] } }),
      response,
    )
    expect(manager.query).toHaveBeenCalledWith('TYPE', ['unoapi:test'])
    expect(response.json).toHaveBeenCalledWith({ result: 'string' })
  })
})
