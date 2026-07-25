import { renderSessionConfig, sessionConfigPayload } from '../../frontend/features/session_config'
import {
  renderConfirmDeregisterModal,
  renderConnectionModal,
  renderMessageModal,
  renderNewSessionModal,
} from '../../frontend/features/session_modals'
import { renderWebhookModal, renderWebhooks, webhookPayload } from '../../frontend/features/webhooks'

describe('frontend features', () => {
  test('renders session config without provider selection', () => {
    const html = renderSessionConfig({ phone: '5566', label: 'Comercial', provider: 'baileys' })
    expect(html).toContain('data-form="session-config"')
    expect(html).not.toContain('name="provider"')
    expect(html).toContain('name="connectionType" type="hidden"')
    expect(html).toContain('execute deregister')
  })

  test('maps the full session form payload', () => {
    const data = new FormData()
    data.set('label', 'Comercial')
    data.set('connectionType', 'qrcode')
    data.set('historyMaxAgeDays', '15')
    data.set('autoConnect', 'on')
    const payload = sessionConfigPayload(data)

    expect(payload).toMatchObject({
      label: 'Comercial',
      connectionType: 'qrcode',
      historyMaxAgeDays: 15,
      autoConnect: true,
      ignoreGroupMessages: false,
    })
  })

  test('keeps webhook ID inside its editor instead of the listing', () => {
    const list = renderWebhooks([{ id: 'secret-id', urlAbsolute: 'https://example.test/hook', enabled: true }])
    const modal = renderWebhookModal({ id: 'secret-id' }, 0)

    expect(list).not.toContain('secret-id')
    expect(list).toContain('<th>Status</th><th>Destino</th>')
    expect(modal).toContain('value="secret-id"')
  })

  test('maps webhook form settings', () => {
    const data = new FormData()
    data.set('id', 'default')
    data.set('urlAbsolute', 'https://example.test/hook')
    data.set('enabled', 'on')
    data.set('sendIncomingMessages', 'on')

    expect(webhookPayload(data)).toMatchObject({
      id: 'default',
      urlAbsolute: 'https://example.test/hook',
      enabled: true,
      sendIncomingMessages: true,
      sendOutgoingMessages: false,
    })
  })

  test('renders every contextual session modal', () => {
    const session = { phone: '5566', label: 'Comercial', connectionType: 'qrcode' as const }
    expect(renderNewSessionModal()).toContain('Motor Zapo')
    expect(renderMessageModal(session)).toContain('data-form="test-message"')
    expect(renderConnectionModal(session)).toContain('Sessão 5566')
    expect(renderConfirmDeregisterModal(session)).toContain('confirm-deregister')
  })
})
