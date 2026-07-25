import { renderAvatar } from '../../frontend/components/avatar'
import { icon } from '../../frontend/components/icons'
import { renderLayout, renderLogin } from '../../frontend/components/layout'
import { renderModal } from '../../frontend/components/modal'
import { renderStatus, statusTone } from '../../frontend/components/status'
import { renderContactCards, renderGroupCards } from '../../frontend/features/entities'

describe('frontend components', () => {
  test('renders known and fallback icons accessibly', () => {
    expect(icon('github')).toContain('<svg')
    expect(icon('github', 'GitHub')).toContain('aria-label="GitHub"')
  })

  test('renders status semantics with green online tone', () => {
    expect(statusTone('online')).toBe('online')
    expect(statusTone('connecting')).toBe('warning')
    expect(renderStatus('online')).toContain('status--online')
  })

  test('renders pictures when available and a fallback otherwise', () => {
    expect(renderAvatar('https://cdn.example/picture.jpg', 'Maria')).toContain('<img')
    expect(renderAvatar('', 'Maria')).toContain('aria-label="Maria"')
  })

  test('renders the responsive shell, login and modal contracts', () => {
    expect(renderLayout({ content: '<p>Conteúdo</p>', collapsed: true, mobileOpen: false })).toContain('app-shell--collapsed')
    expect(renderLogin('Token inválido')).toContain('data-form="login"')
    expect(renderModal('test', 'Teste', '<p>Corpo</p>')).toContain('aria-modal="true"')
  })

  test('renders contact and group cards with picture slots', () => {
    expect(renderContactCards([{ user_id: '1@lid', display_name: 'Maria', last_updated_ms: 1 }])).toContain('entity-card')
    expect(renderGroupCards([{ id: '1@g.us', subject: 'Equipe', participants_count: 4 }])).toContain('4 participantes')
  })
})
