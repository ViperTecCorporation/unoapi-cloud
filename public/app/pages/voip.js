import { icon } from '../components/icons.js?v=4.0.5-7a098242';
import { renderModal } from '../components/modal.js?v=4.0.5-7a098242';
import { renderStatus } from '../components/status.js?v=4.0.5-7a098242';
import { escapeHtml } from '../core/html.js?v=4.0.5-7a098242';
const labels = {
    companies: 'Empresas',
    accounts: 'Linhas',
    lineGroups: 'Grupos de linhas',
    extensionGroups: 'Grupos de ramais',
    sessions: 'Sessões de roteamento',
    extensions: 'Ramais',
    users: 'Usuários',
};
const tabs = [
    ['overview', 'Visão geral'],
    ['lines', 'Linhas'],
    ['extensions', 'Ramais'],
    ['routing', 'Grupos e rotas'],
    ['calls', 'Chamadas'],
    ['recordings', 'Gravações'],
    ['companies', 'Empresas'],
    ['users', 'Usuários'],
    ['settings', 'Configurações'],
];
const asItems = (value) => Array.isArray(value) ? value : [];
const checked = (value) => value !== false ? 'checked' : '';
const selected = (current, value) => `${current ?? ''}` === `${value ?? ''}` ? 'selected' : '';
const selectedMany = (current, value) => Array.isArray(current) && current.map(String).includes(String(value)) ? 'selected' : '';
const options = (items, current, multiple = false) => items.map(item => {
    const label = item.label || item.displayName || item.username || item.phoneNumber || item.id;
    return `<option value="${escapeHtml(`${item.id}`)}" ${multiple ? selectedMany(current, item.id) : selected(current, item.id)}>${escapeHtml(`${label}`)}</option>`;
}).join('');
const badge = (text, tone = 'muted') => `<span class="voip-badge voip-badge--${tone}">${escapeHtml(text)}</span>`;
const sectionHeading = (title, description, action = '') => `
  <div class="section__heading"><div><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(description)}</p></div>${action}</div>`;
const emptyRow = (columns, text) => `<tr><td colspan="${columns}"><div class="empty-state">${escapeHtml(text)}</div></td></tr>`;
const editButton = (resource, id) => `<button class="btn btn--ghost" type="button" data-action="edit-voip-resource" data-resource="${resource}" data-id="${escapeHtml(id)}">${icon('edit')}Editar</button>`;
const resourceGrid = (state, resource, columns, extraActions) => {
    const items = asItems(state[resource]);
    return `<section class="section">
    ${sectionHeading(labels[resource], `Gerencie ${labels[resource].toLowerCase()} sem editar JSON.`, `<button class="btn" type="button" data-action="new-voip-resource" data-resource="${resource}">${icon('plus')}Adicionar</button>`)}
    <div class="table-wrap"><table><thead><tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th class="table-actions">Ações</th></tr></thead><tbody>
      ${items.length ? items.map(item => `<tr>${columns.map(([, render]) => `<td>${render(item)}</td>`).join('')}<td class="table-actions"><div class="row-actions">${extraActions?.(item) || ''}${editButton(resource, `${item.id}`)}</div></td></tr>`).join('') : emptyRow(columns.length + 1, `Nenhum item em ${labels[resource].toLowerCase()}.`)}
    </tbody></table></div>
  </section>`;
};
const companyName = (state, id) => asItems(state.companies).find(item => item.id === id)?.label || id || '—';
const activeRegistrations = (state) => [
    ...asItems(state.registrations?.webrtc).map(item => ({ ...item, transport: 'webrtc' })),
    ...asItems(state.registrations?.sipRtp).map(item => ({ ...item, transport: 'sip_rtp' })),
];
const registrationsForExtension = (state, extension) => activeRegistrations(state).filter(registration => `${registration.id || ''}` === `${extension.id || ''}`
    || `${registration.username || ''}` === `${extension.username || ''}`);
const registrationTransport = (registration) => registration.transport === 'sip_rtp' ? 'SIP/RTP' : 'WebRTC';
const registrationContact = (registration) => {
    if (typeof registration.contact === 'string' && registration.contact.trim())
        return registration.contact;
    const address = registration.peer?.address || registration.peer?.host;
    const port = registration.peer?.port;
    return address ? `${address}${port ? `:${port}` : ''}` : '—';
};
const registrationStatus = (state, extension) => {
    const registrations = registrationsForExtension(state, extension);
    if (!registrations.length)
        return `<div class="stack stack--compact">${badge('Sem registro')}<span class="muted">Nenhum endpoint conectado</span></div>`;
    const transports = [...new Set(registrations.map(registrationTransport))].join(' + ');
    return `<div class="stack stack--compact">${badge('Registrado', 'success')}<span class="muted">${registrations.length} conexão(ões) · ${escapeHtml(transports)}</span></div>`;
};
const renderOverview = (state) => {
    const lines = state.zapoLines || [];
    const pending = lines.filter(item => item.assignmentStatus === 'pending_company').length;
    const online = lines.filter(item => item.connected).length;
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
    </section>`;
};
const renderLines = (state) => {
    const lines = state.zapoLines || [];
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
        ['Slots', item => `${item.slots?.length || 0}`],
        ['Status', item => item.enabled ? badge('Ativa', 'success') : badge('Inativa')],
    ])}`;
};
const renderActiveRegistrations = (state) => {
    const registrations = activeRegistrations(state);
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
  </section>`;
};
const renderExtensions = (state) => resourceGrid(state, 'extensions', [
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
    ['Status', item => item.enabled ? badge('Ativo', 'success') : badge('Inativo')],
]);
const renderRouting = (state) => resourceGrid(state, 'lineGroups', [
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
]);
const recordingCell = (item, urls) => {
    if (item.recordingStatus !== 'available')
        return escapeHtml(`${item.recordingStatus || '—'}`);
    const id = `${item.id || item.callId}`;
    const player = urls[id] ? `<audio class="voip-audio" controls autoplay preload="metadata" src="${escapeHtml(urls[id])}"></audio>` : '';
    return `<div class="voip-recording-actions">${player}<div class="row-actions"><button class="btn btn--ghost" type="button" data-action="play-voip-recording" data-record-id="${escapeHtml(id)}">${icon('phone')}Reproduzir</button><button class="btn btn--ghost" type="button" data-action="download-voip-recording" data-record-id="${escapeHtml(id)}" data-call-id="${escapeHtml(`${item.callId || id}`)}">Baixar</button></div></div>`;
};
const historyTable = (state, urls, recordingsOnly = false) => {
    const items = (state.history?.items || []).filter(item => !recordingsOnly || item.recordingStatus === 'available');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Linha</th><th>Ramal</th><th>Direção</th><th>Status</th><th>Duração</th><th>Gravação</th></tr></thead><tbody>
    ${items.length ? items.map(item => `<tr><td>${escapeHtml(`${item.startedAt || '—'}`)}</td><td>${escapeHtml(`${item.accountLabel || item.accountId || item.phoneNumber || '—'}`)}</td><td>${escapeHtml(`${item.extensionLabel || item.extensionUsername || '—'}`)}</td><td>${escapeHtml(`${item.direction || '—'}`)}</td><td>${escapeHtml(`${item.status || '—'}`)}</td><td>${item.durationSeconds ?? item.recordingDurationSeconds ?? '—'}s</td><td>${recordingCell(item, urls)}</td></tr>`).join('') : emptyRow(7, recordingsOnly ? 'Nenhuma gravação disponível.' : 'Nenhuma chamada no período.')}
  </tbody></table></div>`;
};
const renderCalls = (state, urls) => `<section class="section">${sectionHeading('Nova chamada', 'Origine pela sessão Zapo e conecte ao ramal selecionado.')}
  <form class="filters" data-form="voip-call"><label class="field"><span>Sessão</span><select name="session" required><option value="">Selecione</option>${(state.zapoLines || []).filter(item => item.connected && item.assignmentStatus === 'assigned').map(item => `<option value="${escapeHtml(item.session)}">${escapeHtml(item.session)} · ${escapeHtml(item.companyLabel || '')}</option>`).join('')}</select></label><label class="field"><span>Ramal</span><select name="extensionId" required><option value="">Selecione</option>${options(asItems(state.extensions))}</select></label><label class="field"><span>Destino</span><input name="peerJid" placeholder="5566999999999" required></label><button class="btn" type="submit">${icon('phone')}Ligar</button></form></section>
  <section class="section">${sectionHeading('Chamadas em andamento', 'Transferência e encerramento das chamadas ativas.')}<div class="table-wrap"><table><thead><tr><th>Call ID</th><th>Sessão</th><th>Direção</th><th>Destino</th><th class="table-actions">Ações</th></tr></thead><tbody>${state.calls?.length ? state.calls.map(call => `<tr><td><code>${escapeHtml(call.callId)}</code></td><td>${escapeHtml(call.session)}</td><td>${escapeHtml(call.direction)}</td><td>${escapeHtml(call.callerPn || call.peerJid || '—')}</td><td class="table-actions"><form class="row-actions" data-form="voip-transfer"><input type="hidden" name="callId" value="${escapeHtml(call.callId)}"><select name="targetExtensionId" required><option value="">Transferir para</option>${options(asItems(state.extensions))}</select><button class="btn btn--ghost" type="submit">Transferir</button><button class="btn btn--danger" type="button" data-action="end-voip-call" data-session="${escapeHtml(call.session)}" data-call-id="${escapeHtml(call.callId)}">Encerrar</button></form></td></tr>`).join('') : emptyRow(5, 'Nenhuma chamada ativa.')}</tbody></table></div></section>
  <section class="section">${sectionHeading('Histórico', 'Últimas chamadas processadas pelo serviço VoIP.')}${historyTable(state, urls)}</section>`;
const renderRecordings = (state, urls) => `<section class="section">${sectionHeading('Gravações', 'Reproduza no próprio grid ou baixe o arquivo.', `<button class="btn btn--ghost" type="button" data-action="edit-voip-recording-settings">${icon('settings')}Configurar</button>`)}${historyTable(state, urls, true)}</section>
  <section class="section">${sectionHeading('Armazenamento por linha', 'Uso agregado das gravações armazenadas.')}<div class="table-wrap"><table><thead><tr><th>Linha</th><th>Empresa</th><th>Arquivos</th><th>Tamanho</th></tr></thead><tbody>${asItems(state.recordingSummary?.accounts).map(item => `<tr><td>${escapeHtml(item.accountLabel || item.phoneNumber || item.accountId || '—')}</td><td>${escapeHtml(item.companyLabel || '—')}</td><td>${item.count || 0}</td><td>${item.bytes || 0}</td></tr>`).join('') || emptyRow(4, 'Nenhuma gravação armazenada.')}</tbody></table></div></section>`;
const renderSettings = (state) => `<section class="section">${sectionHeading('Configurações da telefonia', 'Parâmetros operacionais e estado do serviço.')}
  <div class="settings-grid"><article class="card stack"><h3>Gravações</h3><p class="muted">Formato: ${escapeHtml(`${state.recording?.format || '—'}`)} · destino: ${escapeHtml(`${state.recording?.provider || '—'}`)}</p><button class="btn" type="button" data-action="edit-voip-recording-settings">${icon('settings')}Configurar gravações</button></article><article class="card stack"><h3>Licença</h3><strong>${escapeHtml(`${state.license?.status || '—'}`)}</strong><p class="muted">Estado informado pelo serviço VoIP.</p></article><article class="card stack"><h3>Atualização</h3><strong>${escapeHtml(`${state.autoUpdate?.status || state.autoUpdate?.state || '—'}`)}</strong><p class="muted">Atualizador do serviço de telefonia.</p></article></div>
  </section>`;
export const renderVoipPage = (state, loading, error = '', renderOptions = {}) => {
    const tab = renderOptions.tab || 'overview';
    const body = tab === 'overview' ? renderOverview(state)
        : tab === 'lines' ? renderLines(state)
            : tab === 'extensions' ? renderExtensions(state)
                : tab === 'routing' ? renderRouting(state)
                    : tab === 'calls' ? renderCalls(state, renderOptions.recordingUrls || {})
                        : tab === 'recordings' ? renderRecordings(state, renderOptions.recordingUrls || {})
                            : tab === 'companies' ? resourceGrid(state, 'companies', [['Empresa', item => `<strong>${escapeHtml(item.label || item.id)}</strong><br><span class="muted">${escapeHtml(item.id)}</span>`], ['Fuso horário', item => escapeHtml(item.timeZone || '—')], ['Status', item => item.enabled ? badge('Ativa', 'success') : badge('Inativa')]])
                                : tab === 'users' ? resourceGrid(state, 'users', [['Usuário', item => `<strong>${escapeHtml(item.displayName || item.username || item.id)}</strong><br><span class="muted">${escapeHtml(item.username || item.id)}</span>`], ['Perfil', item => escapeHtml(item.role || 'user')], ['Empresas', item => `${item.companyIds?.length || 0}`], ['Status', item => item.enabled ? badge('Ativo', 'success') : badge('Inativo')]])
                                    : renderSettings(state);
    return `<header class="page-header"><div><span class="eyebrow">Telefonia</span><h1>Manager VoIP</h1><p class="muted">Linhas Zapo, empresas, roteamento, ramais, chamadas e gravações.</p></div><button class="btn btn--ghost" type="button" data-action="refresh-voip">${icon('refresh')}${loading ? 'Atualizando…' : 'Atualizar'}</button></header>
    ${error ? `<div class="form-error" role="alert">${escapeHtml(error)}</div>` : ''}
    <nav class="tabs" aria-label="Áreas da telefonia">${tabs.map(([value, label]) => `<button class="tab ${tab === value ? 'tab--active' : ''}" type="button" data-action="voip-tab" data-tab="${value}" aria-selected="${tab === value}">${escapeHtml(label)}</button>`).join('')}</nav>${body}`;
};
const field = (name, label, value = '', type = 'text', required = false) => `<label class="field"><span>${escapeHtml(label)}</span><input name="${name}" type="${type}" value="${escapeHtml(`${value ?? ''}`)}" ${required ? 'required' : ''}></label>`;
const switchField = (name, label, value) => `<label class="voip-check"><input name="${name}" type="checkbox" ${checked(value)}> ${escapeHtml(label)}</label>`;
const selectField = (name, label, items, current, required = false, multiple = false) => `<label class="field"><span>${escapeHtml(label)}</span><select name="${name}" ${required ? 'required' : ''} ${multiple ? 'multiple size="5"' : ''}>${multiple ? '' : '<option value="">Selecione</option>'}${options(items, current, multiple)}</select></label>`;
export const renderVoipResourceModal = (state, resource, id = '') => {
    const item = asItems(state[resource]).find(value => `${value.id}` === id) || { enabled: true };
    const isNew = !id;
    const companies = asItems(state.companies);
    const accounts = asItems(state.accounts);
    const lineGroups = asItems(state.lineGroups);
    const extensionGroups = asItems(state.extensionGroups);
    const extensions = asItems(state.extensions);
    let fields = `${field('id', 'ID', item.id, 'text', true)}${switchField('enabled', 'Ativo', item.enabled)}`;
    if (resource === 'companies')
        fields += `${field('label', 'Nome da empresa', item.label, 'text', true)}${field('timeZone', 'Fuso horário', item.timeZone || 'America/Cuiaba', 'text', true)}`;
    if (resource === 'accounts')
        fields += `${field('label', 'Nome da linha', item.label, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${field('phoneNumber', 'Número WhatsApp', item.phoneNumber, 'text', true)}${item.slots?.[0] ? `<input type="hidden" name="slotId" value="${escapeHtml(item.slots[0].id)}"><input type="hidden" name="slotLabel" value="${escapeHtml(item.slots[0].label)}">${field('maxActiveCalls', 'Chamadas simultâneas', item.slots[0].maxActiveCalls || 1, 'number', true)}` : ''}${field('chatwootBaseUrl', 'Chatwoot URL', item.chatwootRecording?.baseUrl)}${field('chatwootAccountId', 'Chatwoot account ID', item.chatwootRecording?.accountId)}${field('chatwootInboxId', 'Chatwoot inbox ID', item.chatwootRecording?.inboxId)}${field('chatwootApiAccessToken', 'Chatwoot token', '', 'password')}${switchField('chatwootRecordingEnabled', 'Enviar gravações ao Chatwoot', item.chatwootRecording?.enabled)}`;
    if (resource === 'lineGroups')
        fields += `${field('label', 'Nome do grupo', item.label, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${selectField('inboundSessionIds', 'Linhas de entrada', accounts, item.inboundSessionIds, false, true)}${selectField('outboundPrioritySessionIds', 'Prioridade de saída', accounts, item.outboundPrioritySessionIds, false, true)}${selectField('targetExtensionGroupIds', 'Grupos de ramais de destino', extensionGroups, item.targetExtensionGroupIds, false, true)}`;
    if (resource === 'extensionGroups')
        fields += `${field('label', 'Nome do grupo', item.label, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${selectField('extensionIds', 'Ramais', extensions, item.extensionIds, false, true)}`;
    if (resource === 'sessions')
        fields += `${field('label', 'Nome', item.label, 'text', true)}${field('unoSession', 'Sessão Zapo', item.unoSession, 'text', true)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}${selectField('accountId', 'Linha', accounts, item.accountId, true)}${selectField('lineGroupIds', 'Grupos de linhas', lineGroups, item.lineGroupIds, false, true)}${selectField('inboundLineGroupIds', 'Grupos de entrada', lineGroups, item.inboundLineGroupIds, false, true)}${selectField('outboundLineGroupIds', 'Grupos de saída', lineGroups, item.outboundLineGroupIds, false, true)}${selectField('extensions', 'Ramais diretos', extensions, item.routing?.extensions, false, true)}${field('ringTimeoutSeconds', 'Tempo de toque (segundos)', item.routing?.ringTimeoutSeconds || 20, 'number', true)}`;
    if (resource === 'extensions')
        fields += `${field('displayName', 'Nome do ramal', item.displayName, 'text', true)}${field('username', 'Usuário SIP', item.username, 'text', true)}${field('password', isNew ? 'Senha SIP' : 'Nova senha SIP (opcional)', '', 'password', isNew)}${selectField('companyId', 'Empresa', companies, item.companyId, true)}<label class="field"><span>Tipo</span><select name="type"><option value="both" ${selected(item.type, 'both')}>SIP e WebRTC</option><option value="sip" ${selected(item.type, 'sip')}>SIP/RTP</option><option value="webrtc" ${selected(item.type, 'webrtc')}>WebRTC</option></select></label>${selectField('extensionGroupIds', 'Grupos', extensionGroups, item.extensionGroupIds, false, true)}`;
    if (resource === 'users')
        fields += `${field('displayName', 'Nome', item.displayName, 'text', true)}${field('username', 'Usuário', item.username, 'text', true)}${field('password', isNew ? 'Senha' : 'Nova senha (opcional)', '', 'password', isNew)}<label class="field"><span>Perfil</span><select name="role"><option value="user" ${selected(item.role, 'user')}>Usuário</option><option value="admin" ${selected(item.role, 'admin')}>Administrador</option></select></label>${selectField('companyIds', 'Empresas permitidas', companies, item.companyIds, false, true)}`;
    const content = `<form class="form-grid voip-editor-form" data-form="voip-resource-fields"><input type="hidden" name="resource" value="${resource}">${fields}<div class="form-actions wide">${!isNew ? `<button class="btn btn--danger" type="button" data-action="delete-voip-resource" data-resource="${resource}" data-id="${escapeHtml(id)}">${icon('trash')}Excluir</button>` : ''}<button class="btn" type="submit">${icon('save')}Salvar</button></div></form>`;
    return renderModal('voip-resource', `${isNew ? 'Adicionar' : 'Editar'} ${labels[resource].toLowerCase()}`, content, { subtitle: 'Telefonia', wide: true });
};
export const renderVoipAssignLineModal = (state, session) => {
    const companies = asItems(state.companies).filter(item => item.enabled !== false);
    const companyField = companies.length === 0
        ? `${field('companyLabel', 'Nome da empresa', `Empresa ${session}`, 'text', true)}<p class="muted wide">Nenhuma empresa existe. Ela será criada automaticamente.</p>`
        : companies.length === 1
            ? `<input type="hidden" name="companyId" value="${escapeHtml(`${companies[0].id}`)}"><p class="muted wide">Empresa: <strong>${escapeHtml(`${companies[0].label || companies[0].id}`)}</strong></p>`
            : selectField('companyId', 'Empresa', companies, '', true);
    return renderModal('voip-line-assignment', 'Ativar linha Zapo', `<form class="form-grid" data-form="voip-line-assignment"><input type="hidden" name="session" value="${escapeHtml(session)}">${field('label', 'Nome da linha', `Linha ${session}`, 'text', true)}${companyField}${field('maxActiveCalls', 'Chamadas simultâneas', (state.zapoLines || []).find(item => item.session === session)?.maxConcurrentCalls || 1, 'number', true)}${switchField('createBasicRoute', 'Criar grupo, rota e ramal básicos automaticamente', true)}<div class="form-actions wide"><button class="btn" type="submit">${icon('link')}Ativar e configurar</button></div></form>`, { subtitle: session, wide: true });
};
export const renderVoipRecordingSettingsModal = (state) => {
    const value = state.recording || {};
    return renderModal('voip-recording-settings', 'Configurar gravações', `<form class="form-grid" data-form="voip-recording-settings">${switchField('enabled', 'Gravar chamadas', value.enabled)}<label class="field"><span>Destino</span><select name="provider"><option value="local" ${selected(value.provider, 'local')}>Disco local</option><option value="s3" ${selected(value.provider, 's3')}>S3 compatível</option></select></label><label class="field"><span>Formato</span><select name="format"><option value="mp3" ${selected(value.format, 'mp3')}>MP3</option><option value="wav" ${selected(value.format, 'wav')}>WAV</option><option value="gsm" ${selected(value.format, 'gsm')}>GSM</option></select></label>${field('localDir', 'Diretório local', value.localDir || '/home/u/app/data/recordings')}${field('retentionDays', 'Retenção em dias (0 não remove)', value.retentionDays || 0, 'number')}${switchField('stereo', 'Gravar em estéreo', value.stereo)}${field('s3Endpoint', 'Endpoint S3', value.s3Endpoint)}${field('s3Region', 'Região S3', value.s3Region || 'auto')}${field('s3Bucket', 'Bucket', value.s3Bucket)}${field('s3AccessKeyId', 'Access key', value.s3AccessKeyId)}${field('s3SecretAccessKey', 'Secret key (deixe vazio para manter)', '', 'password')}${field('s3PublicBaseUrl', 'URL pública opcional', value.s3PublicBaseUrl)}<div class="form-actions wide"><button class="btn" type="submit">${icon('save')}Salvar</button></div></form>`, { subtitle: 'Telefonia', wide: true });
};
export const renderVoipSipCreatedModal = (username, password) => renderModal('voip-sip-created', 'Linha e ramal ativados', `<div class="stack"><p>A rota básica foi criada. Guarde as credenciais do ramal SIP:</p><dl class="details-list"><div><dt>Usuário</dt><dd><code>${escapeHtml(username)}</code></dd></div><div><dt>Senha</dt><dd><code>${escapeHtml(password)}</code></dd></div></dl><button class="btn" type="button" data-action="copy-value" data-value="${escapeHtml(password)}">${icon('copy')}Copiar senha</button></div>`, { subtitle: 'Telefonia' });
export const renderVoipCredentialsModal = (value) => {
    const rows = [
        ['Usuário', value.username],
        ['Senha', value.password],
        ['URI SIP', value.sipUri],
        ['WebSocket público', value.webrtc?.ws_url],
        ['WebSocket local', value.webrtc?.lan_ws_url],
        ['Domínio SIP', value.webrtc?.sip_domain],
    ].filter(([, item]) => item);
    return renderModal('voip-credentials', 'Credenciais do ramal', `<div class="stack"><p class="muted">Use os mesmos dados em um telefone SIP ou cliente WebRTC. Somente administradores podem revelar a senha.</p><dl class="details-list">${rows.map(([label, item]) => `<div><dt>${escapeHtml(`${label}`)}</dt><dd><code>${escapeHtml(`${item}`)}</code> <button class="btn btn--icon btn--ghost" type="button" data-action="copy-value" data-value="${escapeHtml(`${item}`)}" aria-label="Copiar ${escapeHtml(`${label}`)}">${icon('copy')}</button></dd></div>`).join('')}</dl></div>`, { subtitle: value.displayName || value.username || 'Telefonia', wide: true });
};
export const voipResourceItem = (state, resource, id) => asItems(state[resource]).find(item => `${item.id}` === id);
