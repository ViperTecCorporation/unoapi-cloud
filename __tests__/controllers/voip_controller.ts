import { VoipController } from '../../src/controllers/voip_controller'

const response = () => {
  const res: any = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn((value) => value)
  res.setHeader = jest.fn()
  res.end = jest.fn()
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

  test('proxies a recording with an inline audio content type', async () => {
    const service = { stream: jest.fn().mockResolvedValue(new Response(null, { headers: { 'Content-Type': 'audio/mpeg' } })) }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.recording({ params: { recordId: 'record-1' } } as any, res)
    expect(service.stream).toHaveBeenCalledWith('/v1/console/history-records/record-1/recording')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg')
    expect(res.end).toHaveBeenCalled()
  })

  test('preserves the query string when proxying console requests', async () => {
    const service = { request: jest.fn().mockResolvedValue({ items: [], total: 0 }) }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.console({
      method: 'GET',
      params: { 0: 'history' },
      originalUrl: '/admin/voip/console/history?search=5511%209999&page=2&pageSize=50',
    } as any, res)
    expect(service.request).toHaveBeenCalledWith('/v1/console/history?search=5511%209999&page=2&pageSize=50', {
      method: 'GET',
      body: undefined,
    })
  })

  test('uses the generic console proxy to delete recordings for an account', async () => {
    const service = { request: jest.fn().mockResolvedValue({ deleted: 2, bytes: 1024 }) }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.console({
      method: 'DELETE',
      params: { 0: 'recording/accounts/line-1' },
      originalUrl: '/admin/voip/console/recording/accounts/line-1',
    } as any, res)
    expect(service.request).toHaveBeenCalledWith('/v1/console/recording/accounts/line-1', {
      method: 'DELETE',
      body: JSON.stringify({}),
    })
    expect(res.json).toHaveBeenCalledWith({ deleted: 2, bytes: 1024 })
  })

  test('uploads transfer audio as an authenticated raw request', async () => {
    const service = { request: jest.fn().mockResolvedValue({ id: 'group-1', transferAudioSource: 'configured' }) }
    const controller = new VoipController(service as any)
    const res = response()
    const body = Buffer.from([1, 2, 3])
    await controller.transferAudio({
      method: 'PUT',
      params: { extensionGroupId: 'group-1' },
      headers: { 'content-type': 'audio/mpeg', 'x-file-name': 'espera.mp3' },
      body,
    } as any, res)
    expect(service.request).toHaveBeenCalledWith('/v1/console/extensionGroups/group-1/transfer-audio', {
      method: 'PUT',
      headers: { 'Content-Type': 'audio/mpeg', 'X-File-Name': 'espera.mp3' },
      body,
    })
  })

  test('streams transfer audio without converting it to JSON', async () => {
    const service = {
      stream: jest.fn().mockResolvedValue(new Response(null, {
        headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
      })),
    }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.transferAudio({
      method: 'GET',
      params: { extensionGroupId: 'group 1' },
      originalUrl: '/admin/voip/console/extensionGroups/group%201/transfer-audio?t=123',
    } as any, res)
    expect(service.stream).toHaveBeenCalledWith('/v1/console/extensionGroups/group%201/transfer-audio?t=123')
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/wav')
    expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'no-store')
    expect(res.end).toHaveBeenCalled()
  })
})
