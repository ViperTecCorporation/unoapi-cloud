import { escapeHtml } from '../core/html.js'
import { icon } from '../components/icons.js'
import { renderStatus } from '../components/status.js'
import {
  filterSessions,
  isLegacySession,
  isOnlineStatus,
  sessionLabel,
  sessionPhone,
} from '../domain/session.js'
import type { SessionConfig } from '../domain/types.js'

interface DashboardOptions {
  sessions: SessionConfig[]
  query: string
  status: string
  loading: boolean
  refreshIn: number
}

export const renderDashboard = ({
  sessions,
  query,
  status,
  loading,
  refreshIn,
}: DashboardOptions): string => {
  const visible = filterSessions(sessions, query, status)
  const online = sessions.filter((session) => isOnlineStatus(session.status)).length
  const connecting = sessions.filter((session) => `${session.status}`.toLowerCase() === 'connecting').length
  const offline = Math.max(0, sessions.length - online - connecting)

  return `
    <header class="page-header">
      <div><span class="eyebrow">Operação</span><h1>Visão geral</h1><p class="muted">Sessões e serviços em tempo real.</p></div>
      <div class="actions">
        <a class="btn btn--icon btn--ghost" href="https://github.com/ViperTecCorporation/ViperConnect" target="_blank" rel="noopener" aria-label="GitHub">${icon('github')}</a>
        <button class="btn" type="button" data-action="new-session">${icon('plus')}Nova sessão</button>
      </div>
    </header>

    <div class="health-bar" aria-label="Saúde dos serviços">
      <span>${renderStatus('online')} API</span>
      <span>${renderStatus('online')} Redis</span>
      <span>${renderStatus('online')} RabbitMQ</span>
    </div>

    <section class="stats" aria-label="Resumo das sessões">
      <article class="stat-card"><span>Online</span><strong>${online}</strong><small>de ${sessions.length} sessões</small></article>
      <article class="stat-card"><span>Conectando</span><strong>${connecting}</strong><small>aguardando pareamento</small></article>
      <article class="stat-card"><span>Offline</span><strong>${offline}</strong><small>requerem atenção</small></article>
    </section>

    <section class="section sessions-section">
      <div class="section__heading">
        <div><h2>Sessões</h2><p class="muted" aria-live="polite">${loading ? 'Atualizando…' : `Atualização automática em <span data-refresh-countdown>${refreshIn}s</span>`}</p></div>
        <div class="actions"><span class="auto-refresh">${renderStatus('online')} Automático</span><button class="btn btn--ghost" type="button" data-action="refresh">${icon('refresh')}Atualizar agora</button></div>
      </div>
      <div class="filters">
        <label class="search-field">${icon('search')}<input data-filter="query" value="${escapeHtml(query)}" placeholder="Buscar nome ou telefone" aria-label="Buscar sessão"></label>
        <label class="field field--compact"><span class="sr-only">Status</span><select data-filter="status">
          <option value="all" ${status === 'all' ? 'selected' : ''}>Todos os status</option>
          <option value="online" ${status === 'online' ? 'selected' : ''}>Online</option>
          <option value="connecting" ${status === 'connecting' ? 'selected' : ''}>Conectando</option>
          <option value="offline" ${status === 'offline' ? 'selected' : ''}>Offline</option>
        </select></label>
      </div>
      <div class="table-wrap">
        <table class="session-table">
          <thead><tr><th>Sessão</th><th>Status</th><th>Worker</th><th class="table-actions">Ações</th></tr></thead>
          <tbody>
            ${visible.length ? visible.map((session) => {
              const phone = sessionPhone(session)
              const onlineSession = isOnlineStatus(session.status)
              const legacySession = isLegacySession(session)
              return `<tr>
                <td><div class="session-identity"><span class="session-identity__icon">${icon('message')}</span><span><strong>${escapeHtml(sessionLabel(session))}</strong><small>${escapeHtml(phone)}</small></span></div></td>
                <td>${renderStatus(session.status)}</td>
                <td>${escapeHtml(session.server || 'server_1')}</td>
                <td class="table-actions"><div class="row-actions">
                  <button class="btn btn--ghost" type="button" data-action="manage-session" data-phone="${escapeHtml(phone)}">${icon('settings')}Gerenciar</button>
                  ${legacySession
                    ? '<span class="legacy-label">Baileys desativada</span>'
                    : onlineSession
                    ? `<button class="btn btn--icon btn--ghost" type="button" data-action="test-message" data-phone="${escapeHtml(phone)}" aria-label="Testar mensagem">${icon('send')}</button>`
                    : `<button class="btn" type="button" data-action="connect-session" data-phone="${escapeHtml(phone)}">${icon('link')}Conectar</button>`}
                </div></td>
              </tr>`
            }).join('') : '<tr><td colspan="4"><div class="empty-state">Nenhuma sessão encontrada.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `
}
