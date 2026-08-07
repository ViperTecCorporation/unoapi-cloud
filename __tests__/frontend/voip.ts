import {
  renderVoipCredentialsModal,
  renderVoipPage,
  renderVoipRecordingSettingsModal,
  renderVoipResourceModal,
} from '../../frontend/pages/voip'

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
    expect(html).toContain('Chamadas e gravações')
    expect(html).toContain('Histórico e gravações')
    expect(html).toContain('data-action="edit-voip-recording-settings"')
    expect(html.match(/data-form="voip-history-filter"/g)).toHaveLength(1)
    expect(html).toContain('data-action="voip-tab"')
    expect(html).not.toContain('data-tab="recordings"')
    expect(html).not.toContain('data-tab="users"')
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

  test('reveals automatic extension credentials without a manual activation flow', () => {
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

  test('renders complete company AI settings and keeps redacted secrets blank', () => {
    const html = renderVoipResourceModal({
      bridges: [],
      calls: [],
      companies: [{
        id: 'company-1',
        label: 'Empresa',
        enabled: true,
        aiSummary: {
          enabled: true,
          hasTranscriptionApiKey: true,
          hasSummaryApiKey: true,
          summaryPrompt: 'Resuma objetivamente.',
        },
      }],
    }, 'companies', 'company-1')

    expect(html).toContain('name="id" type="text" value="company-1" required readonly')
    expect(html).toContain('name="aiSummaryEnabled"')
    expect(html).toContain('name="aiTranscriptionApiKey" type="password" value=""')
    expect(html).toContain('name="aiSummaryApiKey" type="password" value=""')
    expect(html).toContain('Chave configurada. Deixe o campo vazio para manter.')
    expect(html).toContain('<textarea name="aiSummaryPrompt"')
    expect(html).not.toContain('Licença')
  })

  test('keeps the default company active while allowing its AI configuration', () => {
    const html = renderVoipResourceModal({
      bridges: [],
      calls: [],
      companies: [{
        id: 'empresa-padrao',
        label: 'Empresa padrão',
        enabled: true,
        provisioningSource: 'zapo_auto',
        aiSummary: { enabled: false },
      }],
    }, 'companies', 'empresa-padrao')

    expect(html).toContain('Ativo · estado gerenciado automaticamente pela sessão Zapo.')
    expect(html).toContain('name="aiSummaryEnabled"')
    expect(html).not.toContain('name="enabled" type="checkbox"')
    expect(html).not.toContain('data-action="delete-voip-resource"')
  })

  test('shows line concurrency while keeping legacy slots read-only and invisible', () => {
    const state = {
      bridges: [],
      calls: [],
      companies: [{ id: 'company-1', label: 'Empresa' }],
      accounts: [{
        id: 'line-1',
        label: 'Linha',
        companyId: 'company-1',
        phoneNumber: '5566999554300',
        slots: [
          { id: '5566999554300-a', label: 'Principal', mode: 'bridge', maxActiveCalls: 3, enabled: true },
          { id: 'legacy-a', label: 'Legado', mode: 'standalone', enabled: true },
        ],
        chatwootRecording: { privateNote: true, hasApiAccessToken: true },
      }],
    }
    const account = renderVoipResourceModal(state, 'accounts', 'line-1')
    expect(account).toContain('name="maxConcurrentCalls"')
    expect(account).toContain('value="4"')
    expect(account).toContain('min="2" max="32"')
    expect(account).not.toContain('data-action="new-voip-slot"')
    expect(account).not.toContain('data-action="edit-voip-slot"')
    expect(account).not.toContain('data-action="delete-voip-slot"')
    expect(account).not.toContain('5566999554300-a')
    expect(account).not.toContain('legacy-a')
    expect(account).not.toContain('slot bridge')
    expect(account).not.toContain('Dispositivo')
    expect(account).not.toContain('maxActiveCalls')
    expect(account).toContain('name="chatwootPrivateNote"')
  })

  test('renders each Zapo line only once on the lines tab', () => {
    const html = renderVoipPage({
      bridges: [],
      calls: [],
      companies: [{ id: 'company-1', label: 'Empresa' }],
      accounts: [{ id: 'line-1', label: 'Linha principal', phoneNumber: '5566999554300', companyId: 'company-1' }],
      zapoLines: [{
        sourceId: 'zapo:uno:5566999554300',
        session: '5566999554300',
        connected: true,
        assignmentStatus: 'assigned',
        accountId: 'line-1',
        companyId: 'company-1',
        companyLabel: 'Empresa',
        advancedRoutingConfigured: true,
        automatic: {
          extensionId: 'automatic-1',
          username: '5566999554300',
          status: 'active',
          registrationCount: 2,
          freeRegistrationCount: 1,
          busyRegistrationCount: 1,
          transports: ['sip', 'webrtc'],
          basicInboundEnabled: true,
        },
        maxConcurrentCalls: 2,
      }],
    }, false, '', { tab: 'lines' })

    expect(html.match(/<h2>Linhas Zapo<\/h2>/g)).toHaveLength(1)
    expect(html).toContain('data-resource="accounts" data-id="line-1"')
    expect(html).toContain('5566999554300')
    expect(html).toContain('1 livre(s) · 1 ocupado(s) · 2 total')
    expect(html).toContain('SIP + WebRTC')
    expect(html).toContain('Básico ativo')
    expect(html).toContain('Avançado')
    expect(html).not.toContain('Ativar linha')
    expect(html).not.toContain('Aguardando empresa')
    expect(html).not.toContain('data-action="new-voip-resource" data-resource="accounts"')
  })

  test('labels automatic and advanced extensions and hides offline automatic ones by default', () => {
    const state = {
      bridges: [],
      calls: [],
      zapoLines: [{
        sourceId: 'zapo:uno:5566999554300',
        session: '5566999554300',
        connected: false,
        automatic: {
          extensionId: 'automatic-1',
          username: '5566999554300',
          status: 'offline' as const,
          registrationCount: 0,
          freeRegistrationCount: 0,
          busyRegistrationCount: 0,
          transports: [] as Array<'sip' | 'webrtc'>,
          basicInboundEnabled: true,
        },
      }],
      extensions: [
        { id: 'automatic-1', username: '5566999554300', displayName: 'Linha automática', enabled: false, provisioningSource: 'zapo_auto' },
        { id: 'advanced-1', username: '1001', displayName: 'Recepção', enabled: true },
      ],
    }
    const hidden = renderVoipPage(state, false, '', { tab: 'extensions' })
    expect(hidden).toContain('Recepção')
    expect(hidden).toContain('Avançado')
    expect(hidden).not.toContain('Linha automática')
    expect(hidden).toContain('Mostrar automáticos offline (1)')

    const visible = renderVoipPage(state, false, '', { tab: 'extensions', showOfflineAutomaticExtensions: true })
    expect(visible).toContain('Linha automática')
    expect(visible).toContain('Automático')
    expect(visible).toContain('Ocultar automáticos offline')
  })

  test('keeps structural fields of automatically managed resources read-only', () => {
    const state = {
      bridges: [],
      calls: [],
      companies: [{ id: 'company-1', label: 'ViperTec' }],
      accounts: [{ id: 'line-1', companyId: 'company-1', phoneNumber: '5566999554300', enabled: true }],
      sessions: [{
        id: 'session-1',
        companyId: 'company-1',
        accountId: 'line-1',
        unoSession: '5566999554300',
        automaticExtensionId: 'automatic-1',
        routing: { extensions: [], basicInboundEnabled: true },
        enabled: true,
      }],
      extensions: [{
        id: 'automatic-1',
        companyId: 'company-1',
        username: '5566999554300',
        type: 'both',
        enabled: true,
      }],
      lineGroups: [],
      extensionGroups: [],
    }

    const account = renderVoipResourceModal(state, 'accounts', 'line-1')
    expect(account).toContain('Empresa (gerenciada)')
    expect(account).toContain('name="phoneNumber" type="text" value="5566999554300" required readonly')
    expect(account).not.toContain('data-action="delete-voip-resource"')

    const session = renderVoipResourceModal(state, 'sessions', 'session-1')
    expect(session).toContain('name="unoSession" type="text" value="5566999554300" required readonly')
    expect(session).toContain('name="accountId" type="text" value="line-1" required readonly')
    expect(session).toContain('Desativar atendimento básico')
    expect(session).not.toContain('data-action="delete-voip-resource"')

    const extension = renderVoipResourceModal(state, 'extensions', 'automatic-1')
    expect(extension).toContain('name="username" type="text" value="5566999554300" required readonly')
    expect(extension).toContain('name="type" value="both"')
    expect(extension).toContain('Transportes (gerenciados)')
    expect(extension).not.toContain('data-action="delete-voip-resource"')
  })

  test('does not expose legacy device selection and keeps extension group distance', () => {
    const state = {
      bridges: [],
      calls: [],
      companies: [{ id: 'company-1', label: 'Empresa' }],
      accounts: [{ id: 'line-1', label: 'Linha', slots: [{ id: 'slot-1', label: 'Bridge', mode: 'bridge' }] }],
      lineGroups: [],
      extensionGroups: [{ id: 'support', label: 'Suporte' }],
      extensions: [{ id: 'ext-1', extensionGroupIds: ['support'], extensionGroupDistances: { support: 2 } }],
      sessions: [{ id: 'session-1', deviceSlotIds: ['slot-1'], routing: { extensions: [] } }],
    }
    const session = renderVoipResourceModal(state, 'sessions', 'session-1')
    expect(session).not.toContain('name="deviceSlotIds"')
    expect(session).not.toContain('slot-1')
    expect(session).toContain('Linha Zapo')

    const extension = renderVoipResourceModal(state, 'extensions', 'ext-1')
    expect(extension).toContain('name="extensionGroupDistance:support"')
    expect(extension).toContain('value="2"')
  })

  test('renders history filters, correct recording sizes and format-aware downloads', () => {
    const html = renderVoipPage({
      bridges: [],
      calls: [],
      history: {
        items: [{ id: 'record-1', callId: 'call-1', remoteName: 'João da Silva', remoteNumber: '5566996269251', remoteJid: '123@lid', recordingStatus: 'available', recordingMime: 'audio/wav' }],
        total: 31,
        page: 2,
        pageSize: 20,
        totalPages: 2,
      },
      recordingSummary: { accounts: [{ accountId: 'line-1', count: 1, sizeBytes: 1536 }] },
    }, false, '', { tab: 'calls', recordingUrls: { 'record-1': 'blob:recording' } })
    expect(html).toContain('data-form="voip-history-filter"')
    expect(html).toContain('<th>Contato</th>')
    expect(html).toContain('João da Silva · 5566996269251')
    expect(html).toContain('Nome, número, ramal ou status')
    expect(html).toContain('data-action="voip-history-page"')
    expect(html).toContain('Armazenamento de gravações por linha')
    expect(html).toContain('data-recording-extension="wav"')
    expect(html).toContain('1.5 KB')
    expect(html).not.toContain('autoplay')
  })

  test('renders the basic inbound switch in advanced session settings', () => {
    const html = renderVoipResourceModal({
      bridges: [],
      calls: [],
      companies: [{ id: 'company-1', label: 'Empresa' }],
      accounts: [{ id: 'line-1', label: 'Linha' }],
      sessions: [{
        id: 'session-1',
        label: 'Principal',
        unoSession: '5566999554300',
        companyId: 'company-1',
        accountId: 'line-1',
        routing: { basicInboundEnabled: false },
      }],
    }, 'sessions', 'session-1')
    expect(html).toContain('name="disableBasicInbound"')
    expect(html).toContain('Desativar atendimento básico')
    expect(html).toContain('name="disableBasicInbound" type="checkbox" checked')
  })

  test('renders every recording storage option and no license card', () => {
    const html = renderVoipRecordingSettingsModal({
      bridges: [],
      calls: [],
      recording: { hasS3SecretAccessKey: true },
    })
    expect(html).toContain('name="deleteLocalAfterUpload"')
    expect(html).toContain('name="s3ForcePathStyle"')
    expect(html).toContain('name="s3PresignTtlSeconds"')
    expect(html).toContain('Chave configurada')
  })
})
