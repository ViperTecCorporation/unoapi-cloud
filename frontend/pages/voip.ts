import { icon } from '../components/icons.js'
import { renderModal } from '../components/modal.js'
import { renderStatus } from '../components/status.js'
import { escapeHtml } from '../core/html.js'
import { t } from '../core/i18n.js'
import type { VoipBootstrap, VoipLineInventoryItem, VoipTab } from '../domain/types.js'

export type VoipResourceName = 'companies' | 'accounts' | 'lineGroups' | 'extensionGroups' | 'sessions' | 'extensions' | 'users'

interface RenderVoipOptions {
  tab?: VoipTab
  recordingUrls?: Record<string, string>
  transferAudioUrls?: Record<string, string>
  routerResult?: Record<string, unknown>
}

const labels: Record<VoipResourceName, string> = {
  companies: 'Empresas',
  accounts: 'Linhas',
  lineGroups: 'Grupos de linhas',
  extensionGroups: 'Grupos de ramais',
  sessions: 'Sessões de roteamento',
  extensions: 'Ramais',
  users: 'Usuários',
}

const tabs: Array<[VoipTab, string]> = [
  ['overview', 'Visão geral'],
  ['lines', 'Linhas'],
  ['extensions', 'Ramais'],
  ['routing', 'Grupos e rotas'],
  ['calls', 'Chamadas'],
  ['recordings', 'Gravações'],
  ['companies', 'Empresas'],
  ['users', 'Usuários'],
  ['settings', 'Configurações'],
]

const asItems = (value: unknown): Array<Record<string, any>> => Array.isArray(value) ? value : []
const checked = (value: unknown) => value !== false ? 'checked' : ''
const selected = (current: unknown, value: unknown) => `${current ?? ''}` === `${value ?? ''}` ? 'selected' : ''
const selectedMany = (current: unknown, value: unknown) => Array.isArray(current) && current.map(String).includes(String(value)) ? 'selected' : ''

const options = (items: Array<Record<string, any>>, current?: unknown, multiple = false) => items.map(item => {
  const label = item.label || item.displayName || item.username || item.phoneNumber || item.id
  return `<option value="${escapeHtml(`${item.id}`)}" ${multiple ? selectedMany(current, item.id) : selected(current, item.id)}>${escapeHtml(`${label}`)}</option>`
}).join('')

const badge = (text: string, tone: 'success' | 'warning' | 'muted' = 'muted') => `<span class="voip-badge voip-badge--${tone}">${escapeHtml(text)}</span>`

const formatBytes = (value: unknown) => {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const amount = bytes / (1024 ** index)
  return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

const recordingExtension = (item: Record<string, any>) => {
  const mime = `${item.recordingMime || item.mime || ''}`.toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('gsm')) return 'gsm'
  if (mime.includes('wav') || mime.includes('wave')) return 'wav'
  const key = `${item.recordingKey || item.recordingUrl || ''}`.toLowerCase().split('?')[0]
  const match = key.match(/\.(mp3|wav|gsm)$/)
  return match?.[1] || 'mp3'
}

const bridgeSlots = (account: Record<string, any>) => asItems(account.slots).filter(slot => slot.mode === 'bridge')

const sectionHeading = (title: string, description: string, action = '') => `
  <div class="section__heading"><div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(description)}</p></div>${action}</div>`

const emptyRow = (columns: number, text: string) => `<tr><td colspan="${columns}"><div class="empty-state">${escapeHtml(text)}</div></td></tr>`

const editButton = (resource: VoipResourceName, id: string) => `<button class="btn btn--ghost" type="button" data-action="edit-voip-resource" data-resource="${resource}" data-id="${escapeHtml(id)}">${icon('edit')}Editar</button>`

const resourceGrid = (state: VoipBootstrap, resource: VoipResourceName, columns: Array<[string, (item: Record<string, any>) => string]>, extraActions?: (item: Record<string, any>) => string) => {
  const items = asItems(state[resource])
  return `<section class="section">
    ${sectionHeading(labels[resource], `Gerencie ${labels[resource].toLowerCase()} sem editar JSON.`, `<button class="btn" type="button" data-action="new-voip-resource" data-resource="${resource}">${icon('plus')}Adicionar</button>`)}
    <div class="table-wrap"><table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th class="table-actions">Ações</th></tr></thead><tbody>
      ${items.length ? items.map(item => `<tr>${columns.map(([, render]) => `<td>${render(item)}</td>`).join('')}<td class="table-actions"><div class="row-actions">${extraActions?.(item) || ''}${editButton(resource, `${item.id}`)}</div></td></tr>`).join('') : emptyRow(columns.length + 1, `Nenhum item em ${labels[resource].toLowerCase()}.`)}
    </tbody></table></div>
  </section>`
}

const companyName = (state: VoipBootstrap, id: unknown) => asItems(state.companies).find(item => item.id === id)?.label || id || '—'

type VoipRegistration = Record<string, any> & { transport: 'webrtc' | 'sip_rtp' }

const activeRegistrations = (state: VoipBootstrap): VoipRegistration[] => [
  ...asItems(state.registrations?.webrtc).map(item => ({ ...item, transport: 'webrtc' as const })),
  ...asItems(state.registrations?.sipRtp).map(item => ({ ...item, transport: 'sip_rtp' as const })),
]

const registrationsForExtension = (state: VoipBootstrap, extension: Record<string, any>) =>
  activeRegistrations(state).filter(registration =>
    `${registration.id || ''}` === `${extension.id || ''}`
    || `${registration.username || ''}` === `${extension.username || ''}`,
  )

const registrationTransport = (registration: VoipRegistration) => registration.transport === 'sip_rtp' ? 'SIP/RTP' : 'WebRTC'

const registrationContact = (registration: VoipRegistration) => {
  if (typeof registration.contact === 'string' && registration.contact.trim()) return registration.contact
  const address = registration.peer?.address || registration.peer?.host
  const port = registration.peer?.port
  return address ? `${address}${port ? `:${port}` : ''}` : '—'
}

const registrationStatus = (state: VoipBootstrap, extension: Record<string, any>) => {
  const registrations = registrationsForExtension(state, extension)
  if (!registrations.length) return `<div class="stack stack--compact">${badge('Sem registro')}<span class="muted">Nenhum endpoint conectado</span></div>`
  const transports = [...new Set(registrations.map(registrationTransport))].join(' + ')
  return `<div class="stack stack--compact">${badge('Registrado', 'success')}<span class="muted">${registrations.length} conexão(ões) · ${escapeHtml(transports)}</span></div>`
}

const renderOverview = (state: VoipBootstrap) => {
  const lines = state.zapoLines || []
  const pending = lines.filter(item => item.assignmentStatus === 'pending_company').length
  const online = lines.filter(item => item.connected).length
  return `<section class="stats">
      <article class="stat-card"><span>Linhas conectadas</span><strong>${online}</strong><small>de ${lines.length} descobertas/configuradas</small></article>
      <article class="stat-card"><span>Aguardando empresa</span><strong>${pending}</strong><small>linhas ainda fora do roteamento</small></article>
      <article class="stat-card"><span>Chamadas ativas</span><strong>${state.calls?.length || 0}</strong><small>isoladas por sessão e call ID</small></article>
      <article class="stat-card"><span>Ramais</span><strong>${state.extensions?.length || 0}</strong><small>SIP/WebRTC e SIP/RTP</small></article>
    </section>
    <section class="section">${sectionHeading('Estado operacional', 'Resumo das linhas e ramais registrados.')}
      <div class="voip-overview-grid">
        <article class="card stack"><h3>Linhas que precisam de atenção</h3>${pending ? lines.filter(item => item.assignmentStatus === 'pending_company').map(item => `<div class="voip-summary-row"><strong>${escapeHtml(item.session)}</strong>${badge('Aguardando empresa', 'warning')}</div>`).join('') : '<p class="muted">Todas as linhas descobertas estão atribuídas.</p>'}</article>
        <article class="card stack"><h3>Registros de ramal</h3><strong class="voip-large-number">${state.registrations?.total || 0}</strong><p class="muted">Endpoints SIP conectados neste momento.</p></article>
      </div>
    </section>`
}

const renderLines = (state: VoipBootstrap) => {
  const lines = state.zapoLines || []
  return `<section class="section">${sectionHeading('Linhas Zapo', 'A bridge descobre as sessões. A empresa é obrigatória antes de ativar o roteamento.')}
    <div class="table-wrap"><table><thead><tr><th>Sessão</th><th>Status</th><th>Empresa</th><th>Roteamento</th><th>Concorrência</th><th class="table-actions">Ações</th></tr></thead><tbody>
      ${lines.length ? lines.map(line => `<tr>
        <td><strong>${escapeHtml(line.session)}</strong><br><span class="muted">${escapeHtml(line.workerId || line.serverId || 'Bridge Zapo')}</span></td>
        <td>${renderStatus(line.connected ? 'online' : 'offline')}</td>
        <td>${line.companyId ? escapeHtml(line.companyLabel || line.companyId) : badge('Aguardando empresa', 'warning')}</td>
        <td>${line.routingConfigured ? badge('Configurado', 'success') : badge('Pendente', 'warning')}</td>
        <td>${line.maxConcurrentCalls || '—'}</td>
        <td class="table-actions"><div class="row-actions">
          ${line.assignmentStatus === 'pending_company' ? `<button class="btn" type="button" data-action="assign-voip-line" data-session="${escapeHtml(line.session)}">${icon('link')}Ativar linha</button>` : editButton('accounts', line.accountId || line.session)}
        </div></td>
      </tr>`).join('') : emptyRow(6, 'Nenhuma sessão Zapo foi descoberta.')}
    </tbody></table></div>
  </section>
  ${resourceGrid(state, 'accounts', [
    ['Linha', item => `<strong>${escapeHtml(item.label || item.id)}</strong><br><span class="muted">${escapeHtml(item.phoneNumber || item.id)}</span>`],
    ['Empresa', item => escapeHtml(`${companyName(state, item.companyId)}`)],
    ['Slots bridge', item => `${bridgeSlots(item).length}`],
    ['Status', item => item.enabled ? badge('Ativa', 'success') : badge('Inativa')],
  ])}`
}

const renderActiveRegistrations = (state: VoipBootstrap) => {
  const registrations = activeRegistrations(state)
  return `<section class="section">${sectionHeading('Registros ativos', 'Endpoints SIP e WebRTC conectados neste momento.')}
    <div class="table-wrap"><table><thead><tr><th>Ramal</th><th>Transporte</th><th>Contato</th><th>Cliente</th><th>Expira em</th><th class="table-actions">Ações</th></tr></thead><tbody>
      ${registrations.length ? registrations.map(registration => `<tr>
        <td><strong>${escapeHtml(registration.extensionLabel || registration.displayName || registration.username || registration.id || '—')}</strong><br><span class="muted">${escapeHtml(registration.username || registration.id || '—')}</span></td>
        <td>${badge(registrationTransport(registration), 'success')}</td>
        <td><code>${escapeHtml(registrationContact(registration))}</code></td>
        <td>${escapeHtml(registration.userAgent || '—')}</td>
        <td>${Number.isFinite(Number(registration.expiresIn)) ? `${Math.max(0, Number(registration.expiresIn))}s` : '—'}</td>
        <td class="table-actions"><button class="btn btn--danger" type="button" data-action="drop-voip-registration" data-extension-id="${escapeHtml(`${registration.id || registration.username || ''}`)}" data-registration-id="${escapeHtml(`${registration.registrationId || ''}`)}" data-registration-type="${registration.transport}">${icon('trash')}Desconectar</button></td>
      </tr>`).join('') : emptyRow(6, 'Nenhum ramal registrado neste momento.')}
    </tbody></table></div>
  </section>`
}

const transferAudioActions = (item: Record<string, any>, urls: Record<string, string>) => {
  if (!item.transferAudioSource) return ''
  const id = `${item.id || ''}`
  const player = urls[id] ? `<audio class="voip-audio" data-transfer-player="${escapeHtml(id)}" controls preload="metadata" src="${escapeHtml(urls[id])}"></audio>` : ''
  return `${player}<button class="btn btn--ghost" type="button" data-action="play-voip-transfer-audio" data-id="${escapeHtml(id)}">${icon('phone')}Ouvir espera</button>`
}

const renderExtensions = (state: VoipBootstrap, transferAudioUrls: Record<string, string>) => resourceGrid(state, 'extensions', [
  ['Ramal', item => `<strong>${escapeHtml(item.displayName || item.id)}</strong><br><span class="muted">${escapeHtml(item.username || item.id)}</span>`],
  ['Empresa', item => escapeHtml(`${companyName(state, item.companyId)}`)],
  ['Tipo', item => escapeHtml(item.type || 'both')],
  ['Grupos', item => `${item.extensionGroupIds?.length || 0}`],
  ['Configuração', item => item.enabled ? badge('Ativo', 'success') : badge('Inativo')],
  ['Registro', item => registrationStatus(state, item)],
], item => state.auth?.role === 'user' ? '' : `<button class="btn btn--ghost" type="button" data-action="show-voip-credentials" data-id="${escapeHtml(`${item.id}`)}">${icon('eye')}Credenciais</button>`) + renderActiveRegistrations(state) + resourceGrid(state, 'extensionGroups', [
  ['Grupo', item => `<strong>${escapeHtml(item.label || item.id)}</strong>`],
  ['Empresa', item => escapeHtml(`${companyName(state, item.companyId)}`)],
  ['Ramais', item => `${item.extensionIds?.length || 0}`],
  ['Áudio de transferência', item => item.transferAudioSource ? badge(item.transferAudioFilename || 'Configurado', 'success') : badge('Não configurado')],
  ['Status', item => item.enabled ? badge('Ativo', 'success') : badge('Inativo')],
], item => transferAudioActions(item, transferAudioUrls))

const renderRouterSimulator = (state: VoipBootstrap, result?: Record<string, unknown>) => {
  const locks = asItems((state.router as Record<string, any> | undefined)?.locks)
  return `<section class="section">
  ${sectionHeading('Simulador de roteamento', 'Valide entrada e saída usando a mesma regra aplicada às chamadas reais.')}
  <div class="voip-overview-grid">
    <form class="card form-grid" data-form="voip-router-inbound"><h3 class="wide">Entrada</h3>${selectField('sessionId', 'Sessão de roteamento', asItems(state.sessions), '', true)}<button class="btn" type="submit">Simular entrada</button></form>
    <form class="card form-grid" data-form="voip-router-outbound"><h3 class="wide">Saída</h3>${selectField('extensionId', 'Ramal', asItems(state.extensions), '', true)}${field('target', 'Destino', '', 'text', true)}<button class="btn" type="submit">Simular saída</button></form>
  </div>
  ${result ? `<div class="card stack"><h3>Resultado</h3><pre class="code-block"><code>${escapeHtml(JSON.stringify(result, null, 2))}</code></pre></div>` : ''}
  <div class="table-wrap"><table><thead><tr><th>Reserva</th><th>Escopo</th><th>Dono</th><th>Destino</th><th class="table-actions">Ações</th></tr></thead><tbody>${locks.length ? locks.map(lock => `<tr><td><code>${escapeHtml(lock.id || '—')}</code></td><td>${escapeHtml(lock.scope || '—')}</td><td>${escapeHtml(lock.extensionId || lock.owner || '—')}</td><td>${escapeHtml(lock.targetNumber || lock.accountId || '—')}</td><td class="table-actions"><button class="btn btn--danger" type="button" data-action="release-voip-router-lock" data-lock-id="${escapeHtml(lock.id || '')}">${icon('trash')}Liberar</button></td></tr>`).join('') : emptyRow(5, 'Nenhuma reserva ativa.')}</tbody></table></div>
</section>`
}

const renderRouting = (state: VoipBootstrap, routerResult?: Record<string, unknown>) => resourceGrid(state, 'lineGroups', [
  ['Grupo', item => `<strong>${escapeHtml(item.label || item.id)}</strong>`],
  ['Empresa', item => escapeHtml(`${companyName(state, item.companyId)}`)],
  ['Entrada', item => `${item.inboundSessionIds?.length || 0} linha(s)`],
  ['Saída', item => `${item.outboundPrioritySessionIds?.length || 0} linha(s)`],
  ['Destinos', item => `${item.targetExtensionGroupIds?.length || 0} grupo(s)`],
]) + resourceGrid(state, 'sessions', [
  ['Sessão', item => `<strong>${escapeHtml(item.label || item.id)}</strong><br><span class="muted">${escapeHtml(item.unoSession || item.id)}</span>`],
  ['Empresa', item => escapeHtml(`${companyName(state, item.companyId)}`)],
  ['Conta', item => escapeHtml(item.accountId || '—')],
  ['Grupos', item => `${item.lineGroupIds?.length || 0}`],
]) + renderRouterSimulator(state, routerResult)

const recordingCell = (item: Record<string, any>, urls: Record<string, string>) => {
  if (item.recordingStatus !== 'available') return escapeHtml(`${item.recordingStatus || '—'}`)
  const id = `${item.id || item.callId}`
  const player = urls[id] ? `<audio class="voip-audio" data-recording-player="${escapeHtml(id)}" controls preload="metadata" src="${escapeHtml(urls[id])}"></audio>` : ''
  return `<div class="voip-recording-actions">${player}<div class="row-actions"><button class="btn btn--ghost" type="button" data-action="play-voip-recording" data-record-id="${escapeHtml(id)}">${icon('phone')}Reproduzir</button><button class="btn btn--ghost" type="button" data-action="download-voip-recording" data-record-id="${escapeHtml(id)}" data-call-id="${escapeHtml(`${item.callId || id}`)}" data-recording-extension="${recordingExtension(item)}">Baixar</button></div></div>`
}

const historyTable = (state: VoipBootstrap, urls: Record<string, string>, recordingsOnly = false) => {
  const items = (state.history?.items || []).filter(item => !recordingsOnly || item.recordingStatus === 'available')
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Linha</th><th>Ramal</th><th>Direção</th><th>Status</th><th>Duração</th><th>Gravação</th></tr></thead><tbody>
    ${items.length ? items.map(item => `<tr><td>${escapeHtml(`${item.startedAt || '—'}`)}</td><td>${escapeHtml(`${item.accountLabel || item.accountId || item.phoneNumber || '—'}`)}</td><td>${escapeHtml(`${item.extensionLabel || item.extensionUsername || '—'}`)}</td><td>${escapeHtml(`${item.direction || '—'}`)}</td><td>${escapeHtml(`${item.status || '—'}`)}</td><td>${item.durationSeconds ?? item.recordingDurationSeconds ?? '—'}s</td><td>${recordingCell(item, urls)}</td></tr>`).join('') : emptyRow(7, recordingsOnly ? 'Nenhuma gravação disponível.' : 'Nenhuma chamada no período.')}
  </tbody></table></div>`
}

const historyControls = (state: VoipBootstrap) => {
  const history = state.history || {}
  const page = Math.max(1, Number(history.page || 1))
  const totalPages = Math.max(1, Number(history.totalPages || 1))
  const total = Math.max(0, Number(history.total || 0))
  return `<form class="filters" data-form="voip-history-filter">
    <label class="field"><span>Buscar</span><input name="search" value="${escapeHtml(`${history.search || ''}`)}" placeholder="Número, ramal ou status"></label>
    <label class="field"><span>Início</span><input name="startDate" type="date" value="${escapeHtml(`${history.startDate || ''}`)}"></label>
    <label class="field"><span>Fim</span><input name="endDate" type="date" value="${escapeHtml(`${history.endDate || ''}`)}"></label>
    <button class="btn" type="submit">Filtrar</button><button class="btn btn--ghost" type="button" data-action="reset-voip-history">Limpar</button>
  </form><div class="section__heading"><p class="muted">${total} registro(s) · página ${page} de ${totalPages}</p><div class="row-actions"><button class="btn btn--ghost" type="button" data-action="voip-history-page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button><button class="btn btn--ghost" type="button" data-action="voip-history-page" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Próxima</button></div></div>`
}

const renderCalls = (state: VoipBootstrap, urls: Record<string, string>) => `<section class="section">${sectionHeading('Nova chamada', 'Origine pela sessão Zapo e conecte ao ramal selecionado.')}
  <form class="filters" data-form="voip-call"><label class="field"><span>Sessão</span><select name="session" required><option value="">Selecione</option>${(state.zapoLines || []).filter(item => item.connected && item.assignmentStatus === 'assigned').map(item => `<option value="${escapeHtml(item.session)}">${escapeHtml(item.session)} · ${escapeHtml(item.companyLabel || '')}</option>`).join('')}</select></label><label class="field"><span>Ramal</span><select name="extensionId" required><option value="">Selecione</option>${options(asItems(state.extensions))}</select></label><label class="field"><span>Destino</span><input name="peerJid" placeholder="5566999999999" required></label><button class="btn" type="submit">${icon('phone')}Ligar</button></form></section>
  <section class="section">${sectionHeading('Chamadas em andamento', 'Transferência e encerramento das chamadas ativas.')}<div class="table-wrap"><table><thead><tr><th>Call ID</th><th>Sessão</th><th>Direção</th><th>Destino</th><th class="table-actions">Ações</th></tr></thead><tbody>${state.calls?.length ? state.calls.map(call => `<tr><td><code>${escapeHtml(call.callId)}</code></td><td>${escapeHtml(call.session)}</td><td>${escapeHtml(call.direction)}</td><td>${escapeHtml(call.callerPn || call.peerJid || '—')}</td><td class="table-actions"><form class="row-actions" data-form="voip-transfer"><input type="hidden" name="callId" value="${escapeHtml(call.callId)}"><select name="targetExtensionId" required><option value="">Transferir para</option>${options(asItems(state.extensions))}</select><button class="btn btn--ghost" type="submit">Transferir</button><button class="btn btn--danger" type="button" data-action="end-voip-call" data-session="${escapeHtml(call.session)}" data-call-id="${escapeHtml(call.callId)}">Encerrar</button></form></td></tr>`).join('') : emptyRow(5, 'Nenhuma chamada ativa.')}</tbody></table></div></section>
  <section class="section">${sectionHeading('Histórico', 'Pesquise e navegue pelas chamadas processadas pelo serviço VoIP.')}${historyControls(state)}${historyTable(state, urls)}</section>`

const renderRecordings = (state: VoipBootstrap, urls: Record<string, string>) => `<section class="section">${sectionHeading('Gravações', 'Reproduza no próprio grid ou baixe o arquivo.', `<button class="btn btn--ghost" type="button" data-action="edit-voip-recording-settings">${icon('settings')}Configurar</button>`)}${historyControls(state)}${historyTable(state, urls, true)}</section>
  <section class="section">${sectionHeading('Armazenamento por linha', 'Uso agregado das gravações armazenadas.')}<div class="table-wrap"><table><thead><tr><th>Linha</th><th>Empresa</th><th>Arquivos</th><th>Tamanho</th></tr></thead><tbody>${asItems(state.recordingSummary?.accounts).map(item => `<tr><td>${escapeHtml(item.accountLabel || item.phoneNumber || item.accountId || '—')}</td><td>${escapeHtml(item.companyLabel || '—')}</td><td>${item.count || 0}</td><td>${formatBytes(item.sizeBytes)}</td></tr>`).join('') || emptyRow(4, 'Nenhuma gravação armazenada.')}</tbody></table></div></section>`

const renderSettings = (state: VoipBootstrap) => `<section class="section">${sectionHeading('Configurações da telefonia', 'Parâmetros operacionais e estado do serviço.')}
  <div class="settings-grid"><article class="card stack"><h3>Gravações</h3><p class="muted">Formato: ${escapeHtml(`${state.recording?.format || '—'}`)} · destino: ${escapeHtml(`${state.recording?.provider || '—'}`)}</p><button class="btn" type="button" data-action="edit-voip-recording-settings">${icon('settings')}Configurar gravações</button></article><article class="card stack"><h3>Atualização</h3><strong>${escapeHtml(`${state.autoUpdate?.status || state.autoUpdate?.state || '—'}`)}</strong><p class="muted">Atualizador do serviço de telefonia.</p></article></div>
  </section>`

export const renderVoipPage = (state: VoipBootstrap, loading: boolean, error = '', renderOptions: RenderVoipOptions = {}): string => {
  const tab = renderOptions.tab || 'overview'
  const body = tab === 'overview' ? renderOverview(state)
    : tab === 'lines' ? renderLines(state)
      : tab === 'extensions' ? renderExtensions(state, renderOptions.transferAudioUrls || {})
        : tab === 'routing' ? renderRouting(state, renderOptions.routerResult)
          : tab === 'calls' ? renderCalls(state, renderOptions.recordingUrls || {})
            : tab === 'recordings' ? renderRecordings(state, renderOptions.recordingUrls || {})
              : tab === 'companies' ? resourceGrid(state, 'companies', [['Empresa', item => `<strong>${escapeHtml(item.label || item.id)}</strong><br><span class="muted">${escapeHtml(item.id)}</span>`], ['Fuso horário', item => escapeHtml(item.timeZone || '—')], ['IA pós-chamada', item => item.aiSummary?.enabled ? badge('Ativa', 'success') : badge('Inativa')], ['Status', item => item.enabled ? badge('Ativa', 'success') : badge('Inativa')]])
                : tab === 'users' ? resourceGrid(state, 'users', [['Usuário', item => `<strong>${escapeHtml(item.displayName || item.username || item.id)}</strong><br><span class="muted">${escapeHtml(item.username || item.id)}</span>`], ['Perfil', item => escapeHtml(item.role || 'user')], ['Empresas', item => `${item.companyIds?.length || 0}`], ['Status', item => item.enabled ? badge('Ativo', 'success') : badge('Inativo')]])
                  : renderSettings(state)
  return `<header class="page-header"><div><span class="eyebrow">Telefonia</span><h1>Manager VoIP</h1><p class="muted">Linhas Zapo, empresas, roteamento, ramais, chamadas e gravações.</p></div><button class="btn btn--ghost" type="button" data-action="refresh-voip">${icon('refresh')}${loading ? 'Atualizando…' : 'Atualizar'}</button></header>
    ${error ? `<div class="form-error" role="alert">${escapeHtml(error)}</div>` : ''}
    <nav class="tabs" aria-label="Áreas da telefonia">${tabs.map(([value, label]) => `<button class="tab ${tab === value ? 'tab--active' : ''}" type="button" data-action="voip-tab" data-tab="${value}" aria-selected="${tab === value}">${escapeHtml(label)}</button>`).join('')}</nav>${body}`
}

const field = (name: string, label: string, value: unknown = '', type = 'text', required = false, readonly = false, attributes = '') => `<label class="field"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(`${value ?? ''}`)}" ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} ${attributes}></label>`
const switchField = (name: string, label: string, value: unknown) => `<label class="voip-check"><input name="${name}" type="checkbox" ${checked(value)}> ${escapeHtml(label)}</label>`
const selectField = (name: string, label: string, items: Array<Record<string, any>>, current: unknown, required = false, multiple = false) => `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}" ${required ? 'required' : ''} ${multiple ? 'multiple size="5"' : ''}>${multiple ? '' : '<option value="">Selecione</option>'}${options(items, current, multiple)}</select></label>`
const textareaField = (name: string, label: string, value: unknown = '') => `<label class="field wide"><span>${escapeHtml(label)}</span><textarea name="${name}" rows="6">${escapeHtml(`${value ?? ''}`)}</textarea></label>`
const configuredSecret = (configured: unknown) => configured ? '<p class="muted">Chave configurada. Deixe o campo vazio para manter.</p>' : ''

const slotOptions = (accounts: Array<Record<string, any>>) => accounts.flatMap(account => bridgeSlots(account).map(slot => ({
  id: slot.id,
  label: `${account.label || account.phoneNumber || account.id} / ${slot.label || slot.id}`,
})))

const renderAccountSlots = (state: VoipBootstrap, account: Record<string, any>, isNew: boolean) => {
  if (isNew) return '<p class="muted wide">Salve a linha para então cadastrar seus slots bridge.</p>'
  const slots = bridgeSlots(account)
  return `<section class="wide stack"><div class="section__heading"><div><h3>Slots bridge</h3><p class="muted">Somente conexões Zapo; sem QR ou motor standalone.</p></div><button class="btn btn--ghost" type="button" data-action="new-voip-slot" data-account-id="${escapeHtml(`${account.id}`)}">${icon('plus')}Adicionar slot</button></div>
    <div class="table-wrap"><table><thead><tr><th>Slot</th><th>Chamadas simultâneas</th><th>Status</th><th class="table-actions">Ações</th></tr></thead><tbody>${slots.length ? slots.map(slot => `<tr><td><strong>${escapeHtml(slot.label || slot.id)}</strong><br><span class="muted">${escapeHtml(slot.id)}</span></td><td>${Number(slot.maxActiveCalls || 1)}</td><td>${slot.enabled ? badge('Ativo', 'success') : badge('Inativo')}</td><td class="table-actions"><div class="row-actions"><button class="btn btn--ghost" type="button" data-action="edit-voip-slot" data-account-id="${escapeHtml(`${account.id}`)}" data-slot-id="${escapeHtml(`${slot.id}`)}">${icon('edit')}Editar</button><button class="btn btn--danger" type="button" data-action="delete-voip-slot" data-account-id="${escapeHtml(`${account.id}`)}" data-slot-id="${escapeHtml(`${slot.id}`)}">${icon('trash')}Excluir</button></div></td></tr>`).join('') : emptyRow(4, 'Nenhum slot bridge cadastrado.')}</tbody></table></div>
  </section>`
}

export const renderVoipResourceModal = (state: VoipBootstrap, resource: VoipResourceName, id = '') => {
  const item = asItems(state[resource]).find(value => `${value.id}` === id) || { enabled: true }
  const isNew = !id
  const companies = asItems(state.companies)
  const accounts = asItems(state.accounts)
  const lineGroups = asItems(state.lineGroups)
  const extensionGroups = asItems(state.extensionGroups)
  const extensions = asItems(state.extensions)
  let fields = `${field('id', 'ID', item.id, 'text', true, !isNew)}${switchField('enabled', 'Ativo', item.enabled)}`
  if (resource === 'companies') {
    const ai = item.aiSummary || {}
    fields += `${field('label', 'Nome da empresa', item.label, 'text', true)}${field('timeZone', 'Fuso horário', item.timeZone || 'America/Cuiaba', 'text', true)}<h3 class="wide">IA pós-chamada</h3>${switchField('aiSummaryEnabled', 'Gerar transcrição e resumo', ai.enabled === true)}${switchField('aiIncludeTranscript', 'Incluir transcrição junto ao resumo', ai.includeTranscript !== false)}${field('aiTranscriptionBaseUrl', 'URL da transcrição', ai.transcriptionBaseUrl || 'https://api.groq.com/openai/v1')}${field('aiTranscriptionApiKey', 'Chave da transcrição (vazio mantém)', '', 'password')}${configuredSecret(ai.hasTranscriptionApiKey)}${field('aiTranscriptionModel', 'Modelo de transcrição', ai.transcriptionModel || 'whisper-large-v3')}${field('aiTranscriptionLanguage', 'Idioma', ai.transcriptionLanguage || 'pt')}${field('aiSummaryBaseUrl', 'URL do resumo', ai.summaryBaseUrl || 'https://api.groq.com/openai/v1')}${field('aiSummaryApiKey', 'Chave do resumo (vazio mantém)', '', 'password')}${configuredSecret(ai.hasSummaryApiKey)}${field('aiSummaryModel', 'Modelo de resumo', ai.summaryModel || 'openai/gpt-oss-20b')}${textareaField('aiSummaryPrompt', 'Prompt do resumo', ai.summaryPrompt)}`
  }
  if (resource === 'accounts') fields += `${field('label', 'Nome da linha', item.label, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${field('phoneNumber', 'Número WhatsApp', item.phoneNumber, 'text', true)}<h3 class="wide">Gravações no Chatwoot</h3>${field('chatwootBaseUrl', 'Chatwoot URL', item.chatwootRecording?.baseUrl)}${field('chatwootAccountId', 'Chatwoot account ID', item.chatwootRecording?.accountId)}${field('chatwootInboxId', 'Chatwoot inbox ID', item.chatwootRecording?.inboxId)}${field('chatwootApiAccessToken', 'Chatwoot token (vazio mantém)', '', 'password')}${configuredSecret(item.chatwootRecording?.hasApiAccessToken)}${switchField('chatwootRecordingEnabled', 'Enviar gravações ao Chatwoot', item.chatwootRecording?.enabled === true)}${switchField('chatwootPrivateNote', 'Enviar como nota privada', item.chatwootRecording?.privateNote !== false)}${renderAccountSlots(state, item, isNew)}`
  if (resource === 'lineGroups') fields += `${field('label', 'Nome do grupo', item.label, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${selectField('inboundSessionIds', 'Linhas de entrada', accounts, item.inboundSessionIds, false, true)}${selectField('outboundPrioritySessionIds', 'Prioridade de saída', accounts, item.outboundPrioritySessionIds, false, true)}${selectField('targetExtensionGroupIds', 'Grupos de ramais de destino', extensionGroups, item.targetExtensionGroupIds, false, true)}`
  if (resource === 'extensionGroups') fields += `${field('label', 'Nome do grupo', item.label, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${selectField('extensionIds', 'Ramais', extensions, item.extensionIds, false, true)}<label class="field wide"><span>Áudio ao transferir (MP3 ou WAV)</span><input name="transferAudioFile" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"><small class="muted">${item.transferAudioSource ? `Atual: ${escapeHtml(item.transferAudioFilename || 'arquivo configurado')}. Selecione outro apenas para substituir.` : 'Opcional. É usado enquanto o destino da transferência atende.'}</small></label>`
  if (resource === 'sessions') fields += `${field('label', 'Nome', item.label, 'text', true)}${field('unoSession', 'Sessão Zapo', item.unoSession, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${selectField('accountId', 'Linha', accounts, item.accountId, true)}${selectField('deviceSlotIds', 'Slots bridge permitidos', slotOptions(accounts), item.deviceSlotIds, false, true)}${selectField('lineGroupIds', 'Grupos de linhas', lineGroups, item.lineGroupIds, false, true)}${selectField('inboundLineGroupIds', 'Grupos de entrada', lineGroups, item.inboundLineGroupIds, false, true)}${selectField('outboundLineGroupIds', 'Grupos de saída', lineGroups, item.outboundLineGroupIds, false, true)}${selectField('extensions', 'Ramais diretos', extensions, item.routing?.extensions, false, true)}${field('ringTimeoutSeconds', 'Tempo de toque (segundos)', item.routing?.ringTimeoutSeconds || 20, 'number', true, false, 'min="1"')}`
  if (resource === 'extensions') {
    const distanceFields = extensionGroups.map((group, index) => field(`extensionGroupDistance:${group.id}`, `Prioridade · ${group.label || group.id}`, item.extensionGroupDistances?.[group.id] || index + 1, 'number', false, false, 'min="1"')).join('')
    fields += `${field('displayName', 'Nome do ramal', item.displayName, 'text', true)}${field('username', 'Usuário SIP', item.username, 'text', true)}${field('password', isNew ? 'Senha SIP' : 'Nova senha SIP (opcional)', '', 'password', isNew)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}<label class="field"><span>Tipo</span><select name="type"><option value="both" ${selected(item.type, 'both')}>SIP e WebRTC</option><option value="sip" ${selected(item.type, 'sip')}>SIP/RTP</option><option value="webrtc" ${selected(item.type, 'webrtc')}>WebRTC</option></select></label>${selectField('extensionGroupIds', 'Grupos', extensionGroups, item.extensionGroupIds, false, true)}${distanceFields ? `<h3 class="wide">Distância nos grupos</h3>${distanceFields}<p class="muted wide">Menor número significa maior prioridade de toque dentro dos grupos selecionados.</p>` : ''}`
  }
  if (resource === 'users') fields += `${field('displayName', 'Nome', item.displayName, 'text', true)}${field('username', 'Usuário', item.username, 'text', true)}${field('password', isNew ? 'Senha' : 'Nova senha (opcional)', '', 'password', isNew)}<label class="field"><span>Perfil</span><select name="role"><option value="user" ${selected(item.role, 'user')}>Usuário</option><option value="admin" ${selected(item.role, 'admin')}>Administrador</option></select></label>${selectField('companyIds', 'Empresas permitidas', companies, item.companyIds, false, true)}`
  const content = `<form class="form-grid voip-editor-form" data-form="voip-resource-fields"><input type="hidden" name="resource" value="${resource}">${fields}<div class="form-actions wide">${!isNew ? `<button class="btn btn--danger" type="button" data-action="delete-voip-resource" data-resource="${resource}" data-id="${escapeHtml(id)}">${icon('trash')}Excluir</button>` : ''}<button class="btn" type="submit">${icon('save')}Salvar</button></div></form>`
  return renderModal('voip-resource', `${isNew ? 'Adicionar' : 'Editar'} ${labels[resource].toLowerCase()}`, content, { subtitle: 'Telefonia', wide: true })
}

const nextBridgeSlot = (account: Record<string, any>) => {
  const used = new Set(asItems(account.slots).map(slot => `${slot.id}`))
  const base = `${account.phoneNumber || account.id || 'slot'}`.replace(/\D/g, '') || `${account.id || 'slot'}`
  for (let index = 0; index < 26; index += 1) {
    const suffix = String.fromCharCode(97 + index)
    const id = `${base}-${suffix}`
    if (!used.has(id)) return { id, label: `Dispositivo ${suffix.toUpperCase()}` }
  }
  const index = used.size + 1
  return { id: `${base}-${index}`, label: `Dispositivo ${index}` }
}

export const renderVoipBridgeSlotModal = (state: VoipBootstrap, accountId: string, slotId = '') => {
  const account = asItems(state.accounts).find(item => `${item.id}` === accountId)
  const current = account ? bridgeSlots(account).find(slot => `${slot.id}` === slotId) : undefined
  const value: Record<string, any> = current || (account ? nextBridgeSlot(account) : { id: '', label: '' })
  const isNew = !slotId
  const content = `<form class="form-grid" data-form="voip-bridge-slot"><input type="hidden" name="accountId" value="${escapeHtml(accountId)}">${field('slotId', 'ID do slot', value.id, 'text', true, true)}${field('label', 'Nome', value.label, 'text', true)}${field('maxActiveCalls', 'Chamadas simultâneas', value.maxActiveCalls || 1, 'number', true, false, 'min="1"')}${switchField('enabled', 'Ativo', value.enabled !== false)}<p class="muted wide">Slot bridge Zapo. O ID não pode ser alterado após a criação.</p><div class="form-actions wide"><button class="btn" type="submit">${icon('save')}Salvar slot</button></div></form>`
  return renderModal('voip-bridge-slot', `${isNew ? 'Adicionar' : 'Editar'} slot bridge`, content, { subtitle: account?.label || accountId, wide: true })
}

export const renderVoipAssignLineModal = (state: VoipBootstrap, session: string) => {
  const companies = asItems(state.companies).filter(item => item.enabled !== false)
  const companyField = companies.length === 0
    ? `${field('companyLabel', 'Nome da empresa', `Empresa ${session}`, 'text', true)}<p class="muted wide">Nenhuma empresa existe. Ela será criada automaticamente.</p>`
    : companies.length === 1
      ? `<input type="hidden" name="companyId" value="${escapeHtml(`${companies[0].id}`)}"><p class="muted wide">Empresa: <strong>${escapeHtml(`${companies[0].label || companies[0].id}`)}</strong></p>`
      : selectField('companyId', 'Empresa', companies, '', true)
  return renderModal('voip-line-assignment', 'Ativar linha Zapo', `<form class="form-grid" data-form="voip-line-assignment"><input type="hidden" name="session" value="${escapeHtml(session)}">${field('label', 'Nome da linha', `Linha ${session}`, 'text', true)}${companyField}${field('maxActiveCalls', 'Chamadas simultâneas', (state.zapoLines || []).find(item => item.session === session)?.maxConcurrentCalls || 1, 'number', true)}${switchField('createBasicRoute', 'Criar grupo, rota e ramal básicos automaticamente', true)}<div class="form-actions wide"><button class="btn" type="submit">${icon('link')}Ativar e configurar</button></div></form>`, { subtitle: session, wide: true })
}

export const renderVoipRecordingSettingsModal = (state: VoipBootstrap) => {
  const value = state.recording || {}
  return renderModal('voip-recording-settings', 'Configurar gravações', `<form class="form-grid" data-form="voip-recording-settings">${switchField('enabled', 'Gravar chamadas', value.enabled)}<label class="field"><span>Destino</span><select name="provider"><option value="local" ${selected(value.provider, 'local')}>Disco local</option><option value="s3" ${selected(value.provider, 's3')}>S3 compatível</option></select></label><label class="field"><span>Formato</span><select name="format"><option value="mp3" ${selected(value.format, 'mp3')}>MP3</option><option value="wav" ${selected(value.format, 'wav')}>WAV</option><option value="gsm" ${selected(value.format, 'gsm')}>GSM</option></select></label>${field('localDir', 'Diretório local', value.localDir || '/home/u/app/data/recordings')}${field('retentionDays', 'Retenção em dias (0 não remove)', value.retentionDays || 0, 'number', false, false, 'min="0"')}${switchField('stereo', 'Gravar em estéreo', value.stereo)}${switchField('deleteLocalAfterUpload', 'Remover arquivo local após enviar ao S3', value.deleteLocalAfterUpload !== false)}${field('s3Endpoint', 'Endpoint S3', value.s3Endpoint)}${field('s3Region', 'Região S3', value.s3Region || 'auto')}${field('s3Bucket', 'Bucket', value.s3Bucket)}${field('s3AccessKeyId', 'Access key', value.s3AccessKeyId)}${field('s3SecretAccessKey', 'Secret key (deixe vazio para manter)', '', 'password')}${configuredSecret(value.hasS3SecretAccessKey)}${switchField('s3ForcePathStyle', 'Forçar path style no S3', value.s3ForcePathStyle !== false)}${field('s3PublicBaseUrl', 'URL pública opcional', value.s3PublicBaseUrl)}${field('s3PresignTtlSeconds', 'Validade da URL assinada (segundos)', value.s3PresignTtlSeconds || 3600, 'number', true, false, 'min="60"')}<div class="form-actions wide"><button class="btn" type="submit">${icon('save')}Salvar</button></div></form>`, { subtitle: 'Telefonia', wide: true })
}

export const renderVoipSipCreatedModal = (username: string, password: string) => renderModal('voip-sip-created', 'Linha e ramal ativados', `<div class="stack"><p>A rota básica foi criada. Guarde as credenciais do ramal SIP:</p><dl class="details-list"><div><dt>Usuário</dt><dd><code>${escapeHtml(username)}</code></dd></div><div><dt>Senha</dt><dd><code>${escapeHtml(password)}</code></dd></div></dl><button class="btn" type="button" data-action="copy-value" data-value="${escapeHtml(password)}">${icon('copy')}Copiar senha</button></div>`, { subtitle: 'Telefonia' })

export const renderVoipCredentialsModal = (value: Record<string, any>) => {
  const rows = [
    ['Usuário', value.username],
    ['Senha', value.password],
    ['URI SIP', value.sipUri],
    ['WebSocket público', value.webrtc?.ws_url],
    ['WebSocket local', value.webrtc?.lan_ws_url],
    ['Domínio SIP', value.webrtc?.sip_domain],
  ].filter(([, item]) => item)
  return renderModal('voip-credentials', 'Credenciais do ramal', `<div class="stack"><p class="muted">Use os mesmos dados em um telefone SIP ou cliente WebRTC. Somente administradores podem revelar a senha.</p><dl class="details-list">${rows.map(([label, item]) => `<div><dt>${escapeHtml(`${label}`)}</dt><dd><code>${escapeHtml(`${item}`)}</code> <button class="btn btn--icon btn--ghost" type="button" data-action="copy-value" data-value="${escapeHtml(`${item}`)}" aria-label="Copiar ${escapeHtml(`${label}`)}">${icon('copy')}</button></dd></div>`).join('')}</dl></div>`, { subtitle: value.displayName || value.username || 'Telefonia', wide: true })
}

export const voipResourceItem = (state: VoipBootstrap, resource: VoipResourceName, id: string) => asItems(state[resource]).find(item => `${item.id}` === id)
