import { renderVoipPage } from '../../frontend/pages/voip'

describe('VoIP manager page', () => {
  test('renders native bridge and call controls without an iframe or internal token', () => {
    const html = renderVoipPage(
      {
        bridges: [{ session: '5566999554300', connected: true, workerId: 'worker_1', maxConcurrentCalls: 2 }],
        calls: [{ session: '5566999554300', callId: 'call_1', direction: 'incoming', peerJid: '5511@lid' }],
        extensions: [{ id: '1001', username: '1001' }],
        companies: [{ id: 'company-1', label: 'Empresa' }],
        history: { items: [{ callId: 'old-call', status: 'completed', direction: 'inbound' }] },
      },
      false,
    )
    expect(html).toContain('5566999554300')
    expect(html).toContain('call_1')
    expect(html).toContain('data-action="end-voip-call"')
    expect(html).toContain('name="extensionId"')
    expect(html).toContain('data-form="voip-resource"')
    expect(html).toContain('data-form="voip-transfer"')
    expect(html).toContain('old-call')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('VOIP_SERVICE_TOKEN')
  })
})
