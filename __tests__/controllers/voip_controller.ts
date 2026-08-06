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

  test.each(['users', 'users/legacy-user', 'login'])('blocks removed legacy console path %s', async suffix => {
    const service = { request: jest.fn() }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.console({
      method: 'GET',
      params: { 0: suffix },
      originalUrl: `/admin/voip/console/${suffix}`,
    } as any, res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: 'resource_not_found' })
    expect(service.request).not.toHaveBeenCalled()
  })

  test('forwards line concurrency without slot fields', async () => {
    const service = { request: jest.fn().mockResolvedValue({ config: { accounts: [] } }) }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.console({
      method: 'PUT',
      params: { 0: 'accounts/line-1' },
      originalUrl: '/admin/voip/console/accounts/line-1',
      body: { id: 'line-1', label: 'Comercial', maxConcurrentCalls: 32 },
    } as any, res)
    expect(service.request).toHaveBeenCalledWith('/v1/console/accounts/line-1', {
      method: 'PUT',
      body: JSON.stringify({ id: 'line-1', label: 'Comercial', maxConcurrentCalls: 32 }),
    })
    expect(`${service.request.mock.calls[0][1].body}`).not.toContain('slot')
  })

  test('removes legacy slot details from generic console responses', async () => {
    const service = { request: jest.fn().mockResolvedValue({
      ok: true,
      slot: { id: 'legacy-slot' },
      lock: { id: 'lock-1', slotId: 'legacy-slot' },
      session: { id: 'session-1', deviceSlotIds: ['legacy-slot'] },
    }) }
    const controller = new VoipController(service as any)
    const res = response()
    await controller.console({
      method: 'POST',
      params: { 0: 'router/resolve-outbound' },
      originalUrl: '/admin/voip/console/router/resolve-outbound',
      body: { extensionId: '1001', target: '5566996269251' },
    } as any, res)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      lock: { id: 'lock-1' },
      session: { id: 'session-1' },
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
