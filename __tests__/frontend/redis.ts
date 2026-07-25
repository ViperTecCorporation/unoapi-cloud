import { setLocale } from '../../frontend/core/i18n'
import {
  redisKeyGroup,
  redisValueIsRedacted,
  renderRedisDeleteModal,
  renderRedisEditorModal,
  renderRedisPage,
} from '../../frontend/pages/redis'

describe('Redis admin page', () => {
  afterEach(() => setLocale('pt-BR'))

  test('detects sensitive masked values before enabling edit', () => {
    expect(redisValueIsRedacted({ auth: { token: '[REDACTED]' } })).toBe(true)
    expect(redisValueIsRedacted({ phone: '5566' })).toBe(false)
  })

  test('groups colon-separated keys into a tree namespace', () => {
    expect(redisKeyGroup('unoapi:zapo:contacts:5566')).toBe('unoapi:zapo')
    expect(redisKeyGroup('unoapi-config:5566')).toBe('unoapi-config')
  })

  test('renders tree, session filter, content and safe query controls', () => {
    const html = renderRedisPage({
      keys: ['unoapi:zapo:contacts:5566', 'unoapi-config:5566'],
      sessions: [{ phone: '5566', label: 'Comercial' }],
      sessionFilter: '5566',
      query: '',
      selected: {
        key: 'unoapi-config:5566',
        type: 'string',
        ttl: 60,
        size: 12,
        truncated: false,
        value: { phone: '5566' },
      },
      loading: false,
      refreshIn: 30,
      error: '',
    })
    expect(html).toContain('Árvore de chaves')
    expect(html).toContain('data-filter="redis-session"')
    expect(html).toContain('data-action="select-redis-key"')
    expect(html).toContain('Somente comandos de leitura permitidos')
    expect(html).toContain('<option>SCAN</option>')
  })

  test('renders confirmed edit and delete forms', () => {
    const details = { key: 'unoapi:test', type: 'string' as const, ttl: -1, size: 2, truncated: false, value: 'ok' }
    const editor = renderRedisEditorModal(details)
    expect(editor).toContain('data-form="redis-save"')
    expect(editor).toContain('name="confirm"')
    expect(editor.indexOf('-1 mantém a chave sem expiração.')).toBeLessThan(editor.indexOf('name="ttlSeconds"'))
    expect(renderRedisDeleteModal(details.key)).toContain('data-form="redis-delete"')
  })

  test('keeps key groups collapsed until a key is selected', () => {
    const base = {
      keys: ['unoapi:zapo:contacts:5566'],
      sessions: [],
      sessionFilter: '',
      query: '',
      loading: false,
      refreshIn: 30,
      error: '',
    }
    expect(renderRedisPage(base)).not.toContain('<details open>')
    expect(renderRedisPage({
      ...base,
      selected: {
        key: 'unoapi:zapo:contacts:5566',
        type: 'hash' as const,
        ttl: -1,
        size: 1,
        truncated: false,
        value: { name: 'Contato' },
      },
    })).toContain('<details open>')
  })

  test('renders Redis maintenance in English', () => {
    setLocale('en')
    expect(renderRedisDeleteModal('unoapi:test')).toContain('Delete Redis key')
  })
})
