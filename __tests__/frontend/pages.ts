import { renderDashboard } from '../../frontend/pages/dashboard'
import { renderSessionPage } from '../../frontend/pages/session'
import { setLocale } from '../../frontend/core/i18n'

describe('frontend pages', () => {
  afterEach(() => setLocale('pt-BR'))

  test('renders dashboard sessions with automatic refresh and management action', () => {
    const html = renderDashboard({
      sessions: [{ phone: '5566', label: 'Comercial', status: 'online', server: 'server_1' }],
      query: '',
      status: 'all',
      loading: false,
      refreshIn: 15,
      visibleLimit: 20,
    })

    expect(html).toContain('data-refresh-countdown')
    expect(html).toContain('data-action="manage-session"')
    expect(html).toContain('status--online')
    expect(html).toContain('aria-label="WhatsApp"')
  })

  test('renders a session as a page with back navigation and session-scoped tabs', () => {
    const html = renderSessionPage({
      session: { phone: '5566', label: 'Comercial', status: 'online', webhooks: [] },
      tab: 'contacts',
      contacts: [],
      contactsHasMore: false,
      contactCount: 0,
      contactsQuery: '',
      groups: [],
      groupsHasMore: false,
      groupsQuery: '',
      loadingSection: false,
      sectionError: '',
    })

    expect(html).toContain('data-action="go-dashboard"')
    expect(html).toContain('data-tab="contacts"')
    expect(html).toContain('Contatos da sessão')
    expect(html).not.toContain('aria-modal="true"')
    expect(html.indexOf('data-tab="webhooks"')).toBeLessThan(html.indexOf('data-tab="contacts"'))
    expect(html.indexOf('data-tab="contacts"')).toBeLessThan(html.indexOf('data-tab="groups"'))
  })

  test('offers only removal for a suppressed Baileys session', () => {
    const html = renderSessionPage({
      session: { phone: '5566', provider: 'baileys', status: 'offline' },
      tab: 'overview',
      contacts: [],
      contactsHasMore: false,
      contactCount: 0,
      contactsQuery: '',
      groups: [],
      groupsHasMore: false,
      groupsQuery: '',
      loadingSection: false,
      sectionError: '',
    })

    expect(html).toContain('Remover sessão legada')
    expect(html).not.toContain('data-action="test-message"')
    expect(html).not.toContain('data-action="session-tab"')
  })

  test('shows the number of cached contacts in the session overview', () => {
    const html = renderSessionPage({
      session: { phone: '5566', status: 'online', webhooks: [] },
      tab: 'overview',
      contacts: [],
      contactsHasMore: false,
      contactCount: 8976,
      contactsQuery: '',
      groups: [],
      groupsHasMore: false,
      groupsQuery: '',
      loadingSection: false,
      sectionError: '',
    })

    expect(html).toContain('<strong>8.976</strong>')
    expect(html).toContain('armazenados no cache Zapo')
  })

  test('limits the session list to twenty items and offers load more', () => {
    const html = renderDashboard({
      sessions: Array.from({ length: 21 }, (_, index) => ({
        phone: `${5500000000000 + index}`,
        label: `Sessão ${index}`,
      })),
      query: '',
      status: 'all',
      loading: false,
      refreshIn: 15,
      visibleLimit: 20,
    })

    expect(html.match(/data-action="manage-session"/g) || []).toHaveLength(20)
    expect(html).toContain('data-action="load-more-sessions"')
  })

  test('renders dashboard and session navigation in English', () => {
    setLocale('en')
    const dashboard = renderDashboard({
      sessions: [],
      query: '',
      status: 'all',
      loading: false,
      refreshIn: 15,
      visibleLimit: 20,
    })
    const session = renderSessionPage({
      session: { phone: '5566', label: 'Sales', status: 'online', webhooks: [] },
      tab: 'contacts',
      contacts: [],
      contactsHasMore: false,
      contactCount: 0,
      contactsQuery: '',
      groups: [],
      groupsHasMore: false,
      groupsQuery: '',
      loadingSection: false,
      sectionError: '',
    })

    expect(dashboard).toContain('Overview')
    expect(dashboard).toContain('Automatic refresh in')
    expect(session).toContain('Session contacts')
    expect(session).toContain('Back to Dashboard')
  })
})
