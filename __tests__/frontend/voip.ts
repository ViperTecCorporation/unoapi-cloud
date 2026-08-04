import { renderVoipAssignLineModal, renderVoipCredentialsModal, renderVoipPage, renderVoipResourceModal } from '../../frontend/pages/voip'

describe('VoIP manager page', () => {
  test('renders native bridge and call controls without an iframe or internal token', () => {
    const html = renderVoipPage(
      {
        bridges: [{ session: '5566999554300', connected: true, workerId: 'worker_1', maxConcurrentCalls: 2 }],
        calls: [{ session: '5566999554300', callId: 'call_1', direction: 'incoming', peerJid: '5511@lid' }],
        extensions: [{ id: '1001', username: '1001' }],
        companies: [{ id: 'company-1', label: 'Empresa' }],
        zapoLines: [{ sourceId: 'zapo:uno:5566999554300', session: '5566999554300', connected: true, assignmentStatus: 'assigned', companyId: 'company-1', companyLabel: 'Empresa', routingConfigured: true }],
        history: { items: [{ id: 'record-1', callId: 'old-call', status: 'completed', direction: 'inbound', recordingStatus: 'available' }] },
      },
      false,
      '',
      { tab: 'calls', recordingUrls: { 'record-1': 'blob:recording' } },
    )
    expect(html).toContain('5566999554300')
    expect(html).toContain('call_1')
    expect(html).toContain('data-action="end-voip-call"')
    expect(html).toContain('name="extensionId"')
    expect(html).toContain('data-form="voip-transfer"')
    expect(html).toContain('old-call')
    expect(html).toContain('data-action="play-voip-recording"')
    expect(html).toContain('<audio')
    expect(html).toContain('data-action="voip-tab"')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('VOIP_SERVICE_TOKEN')
  })

  test('renders field based CRUD modal instead of raw JSON', () => {
    const html = renderVoipResourceModal({ bridges: [], calls: [], companies: [{ id: 'company-1', label: 'Empresa' }], extensions: [] }, 'extensions')
    expect(html).toContain('data-form="voip-resource-fields"')
    expect(html).toContain('name="username"')
    expect(html).not.toContain('name="payload"')
    expect(html).not.toContain('<textarea')
  })

  test('renders active extension registrations and disconnect controls', () => {
    const html = renderVoipPage({
      bridges: [],
      calls: [],
      companies: [{ id: 'company-1', label: 'Empresa' }],
      extensions: [
        { id: 'extension-1', username: '1001', displayName: 'Recepção', enabled: true },
        { id: 'extension-2', username: '1002', displayName: 'Financeiro', enabled: true },
      ],
      registrations: {
        total: 2,
        webrtc: [{
          registrationId: 'webrtc-registration-1',
          id: 'extension-1',
          username: '1001',
          extensionLabel: 'Recepção',
          contact: 'sip:1001@browser.invalid',
          userAgent: 'JsSIP',
          expiresIn: 180,
        }],
        sipRtp: [{
          registrationId: 'sip-registration-1',
          id: 'extension-1',
          username: '1001',
          extensionLabel: 'Recepção',
          contact: 'sip:1001@192.168.0.101:5060',
          userAgent: 'MicroSIP',
          expiresIn: 45,
        }],
      },
    }, false, '', { tab: 'extensions' })

    expect(html).toContain('Registros ativos')
    expect(html).toContain('Registrado')
    expect(html).toContain('2 conexão(ões) · WebRTC + SIP/RTP')
    expect(html).toContain('Sem registro')
    expect(html).toContain('MicroSIP')
    expect(html).toContain('data-action="drop-voip-registration"')
    expect(html).toContain('data-registration-id="sip-registration-1"')
    expect(html).toContain('data-registration-type="sip_rtp"')
  })

  test('creates a company in the quick line flow and reveals admin credentials', () => {
    const assignment = renderVoipAssignLineModal({ bridges: [], calls: [], companies: [] }, '5566996269251')
    expect(assignment).toContain('name="companyLabel"')
    expect(assignment).toContain('Empresa 5566996269251')
    expect(assignment).toContain('Criar grupo, rota e ramal básicos automaticamente')

    const credentials = renderVoipCredentialsModal({
      username: '5566996269251',
      password: 'secret',
      sipUri: 'sip:5566996269251@sip.example.net',
      webrtc: { ws_url: 'wss://sip.example.net/sip/ws' },
    })
    expect(credentials).toContain('secret')
    expect(credentials).toContain('wss://sip.example.net/sip/ws')
    expect(credentials).toContain('data-action="copy-value"')
  })
})
