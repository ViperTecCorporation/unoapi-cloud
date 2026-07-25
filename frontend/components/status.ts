import { escapeHtml } from '../core/html.js'
import { normalizedStatus } from '../domain/session.js'
import type { SessionStatus } from '../domain/types.js'

const statusLabels: Record<string, string> = {
  online: 'Online',
  connecting: 'Conectando',
  offline: 'Offline',
  disconnected: 'Desconectada',
  standby: 'Em espera',
  restart_required: 'Requer reinício',
  forwarder: 'Forwarder',
}

export const statusTone = (status: SessionStatus | undefined): string => {
  const value = normalizedStatus(status)
  if (value === 'online') return 'online'
  if (value === 'connecting' || value === 'standby') return 'warning'
  if (value === 'restart_required') return 'danger'
  return 'offline'
}

export const renderStatus = (status: SessionStatus | undefined): string => {
  const value = normalizedStatus(status)
  const label = statusLabels[value] || value
  return `<span class="status status--${statusTone(status)}"><span class="status__dot"></span>${escapeHtml(label)}</span>`
}
