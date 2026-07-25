import { icon } from '../components/icons.js'
import { renderStatus } from '../components/status.js'
import { escapeHtml } from '../core/html.js'
import { isLegacySession, isOnlineStatus, sessionLabel, sessionPhone } from '../domain/session.js'
import type { ContactDirectoryItem, GroupSummary, SessionConfig, SessionTab } from '../domain/types.js'
import { renderContactCards, renderGroupCards } from '../features/entities.js'
import { renderSessionConfig } from '../features/session_config.js'
import { renderWebhooks } from '../features/webhooks.js'

interface SessionPageOptions {
  session: SessionConfig
  tab: SessionTab
  contacts: ContactDirectoryItem[]
  contactsHasMore: boolean
  contactCount: number
  contactsQuery: string
  groups: GroupSummary[]
  groupsHasMore: boolean
  groupsQuery: string
  loadingSection: boolean
  sectionError: string
}

const tabs: Array<[SessionTab, string]> = [
  ['overview', 'Visão geral'],
  ['config', 'Configuração'],
  ['webhooks', 'Webhooks'],
  ['contacts', 'Contatos'],
  ['groups', 'Grupos'],
]

const renderOverview = (session: SessionConfig, contactCount: number): string => `
  <section class="stats" aria-label="Resumo da sessão">
    <article class="stat-card"><span>Status</span><strong class="stat-card__status">${renderStatus(session.status)}</strong><small>${escapeHtml(session.server || 'server_1')}</small></article>
    <article class="stat-card"><span>Contatos</span><strong>${contactCount.toLocaleString('pt-BR')}</strong><small>armazenados no cache Zapo</small></article>
    <article class="stat-card"><span>Webhooks</span><strong>${session.webhooks?.filter((item) => item.enabled !== false && item.disabled !== true).length || 0}</strong><small>destinos ativos</small></article>
  </section>
  <section class="section">
    <div class="section__heading"><div><h2>Ações da sessão</h2><p class="muted">Toda operação abaixo usa o telefone ${escapeHtml(sessionPhone(session))}.</p></div></div>
    <div class="action-grid">
      <button class="action-card" type="button" data-action="test-message" data-phone="${escapeHtml(sessionPhone(session))}">${icon('send')}<span><strong>Testar mensagem</strong><small>Enviar texto pela API</small></span></button>
      <button class="action-card" type="button" data-action="connect-session" data-phone="${escapeHtml(sessionPhone(session))}">${icon('link')}<span><strong>${isOnlineStatus(session.status) ? 'Ver conexão' : 'Conectar'}</strong><small>QR Code ou código de pareamento</small></span></button>
      <button class="action-card action-card--danger" type="button" data-action="deregister-session" data-phone="${escapeHtml(sessionPhone(session))}">${icon('trash')}<span><strong>Desconectar</strong><small>Remover vínculo e exigir novo pareamento</small></span></button>
    </div>
  </section>
`

const renderContacts = (session: SessionConfig, contacts: ContactDirectoryItem[], hasMore: boolean, loading: boolean, error: string, query: string): string => `
  <section class="section">
    <div class="section__heading">
      <div><h2>Contatos da sessão</h2><p class="muted">Nome, telefone de apresentação e LID canônico.</p></div>
      <button class="btn btn--ghost" type="button" data-action="reload-contacts">${icon('refresh')}Atualizar</button>
    </div>
    <label class="search-field entity-search">${icon('search')}<input data-filter="contacts-query" value="${escapeHtml(query)}" placeholder="Pesquisar nome, telefone, username ou LID" aria-label="Pesquisar contatos"></label>
    ${error ? `<div class="inline-error">${escapeHtml(error)}</div>` : ''}
    ${loading ? '<div class="loading-state">Carregando contatos…</div>' : renderContactCards(contacts, sessionPhone(session))}
    ${hasMore && !loading ? `<div class="load-more"><button class="btn" type="button" data-action="load-more-contacts">Carregar mais</button></div>` : ''}
  </section>
`

const renderGroups = (session: SessionConfig, groups: GroupSummary[], hasMore: boolean, loading: boolean, error: string, query: string): string => `
  <section class="section">
    <div class="section__heading">
      <div><h2>Grupos da sessão</h2><p class="muted">Cache e imagens dos grupos sincronizados por esta sessão.</p></div>
      <button class="btn btn--ghost" type="button" data-action="reload-groups">${icon('refresh')}Atualizar</button>
    </div>
    <label class="search-field entity-search">${icon('search')}<input data-filter="groups-query" value="${escapeHtml(query)}" placeholder="Pesquisar nome ou ID do grupo" aria-label="Pesquisar grupos"></label>
    ${error ? `<div class="inline-error">${escapeHtml(error)}</div>` : ''}
    ${loading ? '<div class="loading-state">Carregando grupos…</div>' : renderGroupCards(groups, sessionPhone(session))}
    ${hasMore && !loading ? `<div class="load-more"><button class="btn" type="button" data-action="load-more-groups">Carregar mais</button></div>` : ''}
  </section>
`

const renderPanel = (options: SessionPageOptions): string => {
  if (options.tab === 'config') return renderSessionConfig(options.session)
  if (options.tab === 'contacts') {
    return renderContacts(options.session, options.contacts, options.contactsHasMore, options.loadingSection, options.sectionError, options.contactsQuery)
  }
  if (options.tab === 'webhooks') return `<section class="section">${renderWebhooks(options.session.webhooks || [])}</section>`
  if (options.tab === 'groups') {
    return renderGroups(options.session, options.groups, options.groupsHasMore, options.loadingSection, options.sectionError, options.groupsQuery)
  }
  return renderOverview(options.session, options.contactCount)
}

export const renderSessionPage = (options: SessionPageOptions): string => {
  const { session, tab } = options
  const legacySession = isLegacySession(session)
  return `
    <header class="page-header session-header">
      <div class="session-header__title">
        <button class="btn btn--icon btn--ghost" type="button" data-action="go-dashboard" aria-label="Voltar ao Dashboard">${icon('arrowLeft')}</button>
        <div><span class="eyebrow">Sessão · ${escapeHtml(sessionPhone(session))}</span><h1>${escapeHtml(sessionLabel(session))}</h1><p class="muted">${renderStatus(session.status)} <span>${escapeHtml(session.server || 'server_1')}</span></p></div>
      </div>
      <div class="actions">
        ${
          legacySession
            ? ''
            : `<button class="btn" type="button" data-action="test-message" data-phone="${escapeHtml(sessionPhone(session))}">${icon('send')}Testar mensagem</button>`
        }
      </div>
    </header>
    ${
      legacySession
        ? `<section class="section legacy-migration">
          <div>
            <span class="eyebrow">Migração necessária</span>
            <h2>Baileys está desativada nesta versão</h2>
            <p class="muted">Remova a sessão para limpar suas chaves legadas do Redis. Depois, registre novamente o mesmo telefone para parear diretamente na Zapo.</p>
          </div>
          <button class="btn btn--danger" type="button" data-action="deregister-session" data-phone="${escapeHtml(sessionPhone(session))}">${icon('trash')}Remover sessão legada</button>
        </section>`
        : `<nav class="tabs" aria-label="Áreas da sessão">
          ${tabs.map(([value, label]) => `<button class="tab ${tab === value ? 'tab--active' : ''}" type="button" data-action="session-tab" data-tab="${value}" aria-selected="${tab === value}">${escapeHtml(label)}</button>`).join('')}
        </nav>
        <div class="session-content">${renderPanel(options)}</div>`
    }
  `
}
