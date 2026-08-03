import {
  filterSessions,
  isConnectingStatus,
  isLegacySession,
  isOnlineStatus,
  normalizedStatus,
  sessionLabel,
  sessionPhone,
} from '../../frontend/domain/session'
import { shouldRenderBackgroundUpdate } from '../../frontend/domain/render_policy'

describe('frontend session domain', () => {
  const sessions = [
    { id: '5566991111111', label: 'Comercial', status: 'online' },
    { phone: '5566992222222', label: 'Financeiro', status: 'connecting' },
  ]

  test('resolves the canonical session phone and label', () => {
    expect(sessionPhone(sessions[0])).toBe('5566991111111')
    expect(sessionLabel(sessions[1])).toBe('Financeiro')
  })

  test('normalizes and classifies statuses', () => {
    expect(normalizedStatus(' ONLINE ')).toBe('online')
    expect(isOnlineStatus('online')).toBe(true)
    expect(isConnectingStatus('connecting')).toBe(true)
  })

  test('classifies suppressed legacy providers', () => {
    expect(isLegacySession({ provider: 'baileys' })).toBe(true)
    expect(isLegacySession({ provider: 'forwarder' })).toBe(true)
    expect(isLegacySession({ provider: 'zapo' })).toBe(false)
  })

  test('filters by label, phone and status', () => {
    expect(filterSessions(sessions, 'comer', 'all')).toEqual([sessions[0]])
    expect(filterSessions(sessions, '2222', 'connecting')).toEqual([sessions[1]])
    expect(filterSessions(sessions, '', 'offline')).toEqual([])
  })

  test('treats disconnected sessions as offline in the dashboard filter', () => {
    expect(filterSessions([
      { phone: '1', status: 'disconnected' },
      { phone: '2', status: 'online' },
    ], '', 'offline')).toHaveLength(1)
  })

  test('does not redraw background updates while a modal is open', () => {
    expect(shouldRenderBackgroundUpdate(false)).toBe(true)
    expect(shouldRenderBackgroundUpdate(true)).toBe(false)
  })
})
