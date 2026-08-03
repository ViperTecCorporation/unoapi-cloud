import { VoipController } from '../../src/controllers/voip_controller'

const response = () => {
  const res: any = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn((value) => value)
  return res
}

describe('VoipController', () => {
  test('forwards call creation through the authenticated internal service', async () => {
    const service = { request: jest.fn().mockResolvedValue({ session: '5566999554300', callId: 'call_1' }) }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.calls({ method: 'POST', body: { session: '5566999554300', peerJid: '5566996269251@s.whatsapp.net', extensionId: '1001' } } as any, res)
    expect(service.request).toHaveBeenCalledWith('/v1/zapo/calls', {
      method: 'POST',
      body: JSON.stringify({ session: '5566999554300', peerJid: '5566996269251@s.whatsapp.net', extensionId: '1001' }),
    })
    expect(res.status).toHaveBeenCalledWith(201)
  })

  test('rejects unknown commands before contacting the service', async () => {
    const service = { request: jest.fn() }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.command({ params: { command: 'reset', callId: 'call_1' }, body: {} } as any, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(service.request).not.toHaveBeenCalled()
  })
})
