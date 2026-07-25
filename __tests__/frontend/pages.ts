import { renderDashboard } from '../../frontend/pages/dashboard'
import { renderSessionPage } from '../../frontend/pages/session'

describe('frontend pages', () => {
  test('renders dashboard sessions with automatic refresh and management action', () => {
    const html = renderDashboard({
      sessions: [{ phone: '5566', label: 'Comercial', status: 'online', server: 'server_1' }],
      query: '',
      status: 'all',
      loading: false,
      refreshIn: 15,
    })

    expect(html).toContain('data-refresh-countdown')
    expect(html).toContain('data-action="manage-session"')
    expect(html).toContain('status--online')
  })

  test('renders a session as a page with back navigation and session-scoped tabs', () => {
    const html = renderSessionPage({
      session: { phone: '5566', label: 'Comercial', status: 'online', webhooks: [] },
      tab: 'contacts',
      contacts: [],
      contactsHasMore: false,
      groups: [],
      loadingSection: false,
      sectionError: '',
    })

    expect(html).toContain('data-action="go-dashboard"')
    expect(html).toContain('data-tab="contacts"')
    expect(html).toContain('Contatos da sessão')
    expect(html).not.toContain('aria-modal="true"')
  })

  test('offers only removal for a suppressed Baileys session', () => {
    const html = renderSessionPage({
      session: { phone: '5566', provider: 'baileys', status: 'offline' },
      tab: 'overview',
      contacts: [],
      contactsHasMore: false,
      groups: [],
      loadingSection: false,
      sectionError: '',
    })

    expect(html).toContain('Remover sessão legada')
    expect(html).not.toContain('data-action="test-message"')
    expect(html).not.toContain('data-action="session-tab"')
  })
})
