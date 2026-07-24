import type { Request, Response } from 'express'
import { mockDeep } from 'jest-mock-extended'
import { defaultConfig } from '../../src/services/config'
import { RegistrationController } from '../../src/controllers/registration_controller'
import type { Logout } from '../../src/services/logout'
import type { Reload } from '../../src/services/reload'
import { getConfig as getStoredConfig, setConfig } from '../../src/services/redis'

jest.mock('../../src/services/redis', () => ({
  getConfig: jest.fn(),
  setConfig: jest.fn(),
}))

const storedConfigMock = getStoredConfig as jest.MockedFunction<typeof getStoredConfig>
const setConfigMock = setConfig as jest.MockedFunction<typeof setConfig>

const response = () => {
  const res = mockDeep<Response>()
  res.status.mockReturnValue(res)
  res.json.mockReturnValue(res)
  return res
}

describe('RegistrationController connection type policy', () => {
  beforeEach(() => jest.clearAllMocks())

  test('an offline Zapo register cannot switch QR to pairing code without deregister', async () => {
    const config = { ...defaultConfig, provider: 'zapo' as const, connectionType: 'qrcode' as const }
    storedConfigMock.mockResolvedValue({ provider: 'zapo', connectionType: 'qrcode' })
    const reload = mockDeep<Reload>()
    const controller = new RegistrationController(jest.fn().mockResolvedValue(config), reload, mockDeep<Logout>())
    const req = { params: { phone: '5566000000001' }, body: { connectionType: 'pairing_code' }, method: 'POST', headers: {}, query: {} } as unknown as Request

    await controller.register(req, response())

    expect(setConfigMock).toHaveBeenCalledWith('5566000000001', {
      provider: 'zapo',
      connectionType: 'qrcode',
    })
    expect(reload.run).toHaveBeenCalledWith('5566000000001')
  })

  test('a new registration can select pairing code after deregister removed the config', async () => {
    const config = { ...defaultConfig, provider: 'zapo' as const, connectionType: 'pairing_code' as const }
    storedConfigMock.mockResolvedValue(undefined)
    const reload = mockDeep<Reload>()
    const controller = new RegistrationController(jest.fn().mockResolvedValue(config), reload, mockDeep<Logout>())
    const req = { params: { phone: '5566000000002' }, body: { connectionType: 'pairing_code' }, method: 'POST', headers: {}, query: {} } as unknown as Request

    await controller.register(req, response())

    expect(setConfigMock).toHaveBeenCalledWith('5566000000002', {
      provider: 'zapo',
      connectionType: 'pairing_code',
    })
  })
})
