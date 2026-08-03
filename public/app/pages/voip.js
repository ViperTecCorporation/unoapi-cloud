import { icon } from '../components/icons.js?v=4.0.3-e718d8da';
import { renderStatus } from '../components/status.js?v=4.0.3-e718d8da';
import { escapeHtml } from '../core/html.js?v=4.0.3-e718d8da';
import { t } from '../core/i18n.js?v=4.0.3-e718d8da';
const resourceEditor = (label, resource, items = []) => {
    const values = Array.isArray(items) ? items : [];
    const editor = (item, isNew = false) => `
    <form class="card stack" data-form="voip-resource">
      <input type="hidden" name="resource" value="${escapeHtml(resource)}">
      <label class="field"><span>ID</span><input name="id" value="${escapeHtml(isNew ? '' : `${item.id || ''}`)}" required></label>
      <label class="field"><span>JSON</span><textarea name="payload" rows="10" spellcheck="false">${escapeHtml(JSON.stringify(item, null, 2))}</textarea></label>
      <div class="table-actions"><button class="btn" type="submit">${t('Salvar')}</button></div>
    </form>`;
    return `<details class="section"><summary><strong>${escapeHtml(label)}</strong> <span class="muted">(${values.length})</span></summary>
    <div class="stack">${values.map(item => `<details><summary>${escapeHtml(`${item.label || item.displayName || item.username || item.id || 'item'}`)}</summary>${editor(item)}<form data-form="voip-resource-delete"><input type="hidden" name="resource" value="${escapeHtml(resource)}"><input type="hidden" name="id" value="${escapeHtml(`${item.id || ''}`)}"><button class="btn btn--ghost" type="submit">${t('Excluir')}</button></form></details>`).join('')}
    <details><summary>${t('Adicionar')}</summary>${editor({ enabled: true }, true)}</details></div></details>`;
};
const settingsEditor = (label, path, value = {}) => `
  <details class="section"><summary><strong>${escapeHtml(label)}</strong></summary>
    <form class="card stack" data-form="voip-console-json"><input type="hidden" name="path" value="${escapeHtml(path)}">
      <label class="field"><span>JSON</span><textarea name="payload" rows="12" spellcheck="false">${escapeHtml(JSON.stringify(value, null, 2))}</textarea></label>
      <button class="btn" type="submit">${t('Salvar')}</button>
    </form></details>`;
export const renderVoipPage = (state, loading, error = '') => {
    const bridges = state.bridges || [];
    const calls = state.calls || [];
    const online = bridges.filter((item) => item.connected).length;
    return `
    <header class="page-header">
      <div><span class="eyebrow">${t('Telefonia')}</span><h1>${t('Chamadas')}</h1><p class="muted">${t('Linhas Zapo, ramais e chamadas em uma única interface.')}</p></div>
      <button class="btn btn--ghost" type="button" data-action="refresh-voip">${icon('refresh')}${t('Atualizar')}</button>
    </header>
    ${error ? `<div class="form-error" role="alert">${escapeHtml(error)}</div>` : ''}
    <section class="stats">
      <article class="stat-card"><span>${t('Linhas conectadas')}</span><strong>${online}</strong><small>${t('de {total} configuradas', { total: bridges.length })}</small></article>
      <article class="stat-card"><span>${t('Chamadas ativas')}</span><strong>${calls.length}</strong><small>${t('áudio isolado por chamada')}</small></article>
      <article class="stat-card"><span>${t('Ramais')}</span><strong>${state.extensions?.length || 0}</strong><small>SIP/WebRTC e SIP/RTP</small></article>
    </section>
    <section class="section">
      <div class="section__heading"><div><h2>${t('Nova chamada')}</h2><p class="muted">${t('Origina pela sessão Zapo selecionada.')}</p></div></div>
      <form class="filters" data-form="voip-call">
        <label class="field"><span>${t('Sessão')}</span><select name="session" required>
          <option value="">${t('Selecione')}</option>
          ${bridges
        .filter((item) => item.connected)
        .map((item) => `<option value="${escapeHtml(item.session)}">${escapeHtml(item.session)}</option>`)
        .join('')}
        </select></label>
        <label class="field"><span>${t('Ramal')}</span><select name="extensionId" required>
          <option value="">${t('Selecione')}</option>
          ${(state.extensions || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.username || item.id)}</option>`).join('')}
        </select></label>
        <label class="field"><span>${t('Destino')}</span><input name="peerJid" placeholder="5566999999999@s.whatsapp.net" required></label>
        <button class="btn" type="submit">${icon('phone')}${t('Ligar')}</button>
      </form>
    </section>
    <section class="section">
      <div class="section__heading"><div><h2>${t('Linhas WhatsApp')}</h2><p class="muted">${loading ? t('Atualizando…') : t('Bridge direto com o worker dono da sessão.')}</p></div></div>
      <div class="table-wrap"><table class="session-table"><thead><tr><th>${t('Sessão')}</th><th>Status</th><th>${t('Worker')}</th><th>${t('Limite')}</th></tr></thead><tbody>
        ${bridges.length ? bridges.map((item) => `<tr><td><strong>${escapeHtml(item.session)}</strong></td><td>${renderStatus(item.connected ? 'online' : 'offline')}</td><td>${escapeHtml(item.workerId || '—')}</td><td>${item.maxConcurrentCalls || '—'}</td></tr>`).join('') : `<tr><td colspan="4"><div class="empty-state">${t('Nenhum bridge conectado.')}</div></td></tr>`}
      </tbody></table></div>
    </section>
    <section class="section">
      <div class="section__heading"><div><h2>${t('Chamadas em andamento')}</h2></div></div>
      <div class="table-wrap"><table class="session-table"><thead><tr><th>Call ID</th><th>${t('Sessão')}</th><th>${t('Direção')}</th><th>${t('Destino')}</th><th></th></tr></thead><tbody>
        ${calls.length ? calls.map((call) => `<tr><td><code>${escapeHtml(call.callId)}</code></td><td>${escapeHtml(call.session)}</td><td>${escapeHtml(call.direction)}</td><td>${escapeHtml(call.callerPn || call.peerJid || '—')}</td><td class="table-actions"><form data-form="voip-transfer"><input type="hidden" name="callId" value="${escapeHtml(call.callId)}"><select name="targetExtensionId" required><option value="">${t('Transferir para')}</option>${(state.extensions || []).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.username || item.id)}</option>`).join('')}</select><button class="btn btn--ghost" type="submit">${t('Transferir')}</button></form><button class="btn btn--ghost" data-action="end-voip-call" data-session="${escapeHtml(call.session)}" data-call-id="${escapeHtml(call.callId)}">${t('Encerrar')}</button></td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">${t('Nenhuma chamada ativa.')}</div></td></tr>`}
      </tbody></table></div>
    </section>
    <section class="section"><div class="section__heading"><div><h2>${t('Histórico e gravações')}</h2><p class="muted">${t('Últimas chamadas processadas pelo serviço de telefonia.')}</p></div></div>
      <div class="table-wrap"><table class="session-table"><thead><tr><th>Call ID</th><th>Status</th><th>${t('Direção')}</th><th>${t('Destino')}</th><th>${t('Gravação')}</th></tr></thead><tbody>
      ${(state.history?.items || []).map(item => `<tr><td><code>${escapeHtml(`${item.callId || ''}`)}</code></td><td>${escapeHtml(`${item.status || ''}`)}</td><td>${escapeHtml(`${item.direction || ''}`)}</td><td>${escapeHtml(`${item.remoteNumber || '—'}`)}</td><td>${escapeHtml(`${item.recordingStatus || '—'}`)}</td></tr>`).join('') || `<tr><td colspan="5">${t('Nenhum histórico disponível.')}</td></tr>`}
      </tbody></table></div></section>
    <section class="section"><div class="section__heading"><div><h2>${t('Licença e atualização')}</h2></div></div><div class="stats"><article class="stat-card"><span>${t('Licença')}</span><strong>${escapeHtml(`${state.license?.status || '—'}`)}</strong></article><article class="stat-card"><span>${t('Atualização')}</span><strong>${escapeHtml(`${state.autoUpdate?.status || state.autoUpdate?.state || '—'}`)}</strong></article><article class="stat-card"><span>${t('Gravações')}</span><strong>${escapeHtml(`${state.recordingSummary?.total || state.recordingSummary?.count || 0}`)}</strong></article></div></section>
    <section class="section"><div class="section__heading"><div><h2>${t('Configuração avançada')}</h2><p class="muted">${t('Edição integral dos recursos do serviço VoIP.')}</p></div></div>
      ${resourceEditor(t('Empresas'), 'companies', state.companies)}
      ${resourceEditor(t('Linhas'), 'accounts', state.accounts)}
      ${resourceEditor(t('Grupos de linhas'), 'lineGroups', state.lineGroups)}
      ${resourceEditor(t('Grupos de ramais'), 'extensionGroups', state.extensionGroups)}
      ${resourceEditor(t('Sessões'), 'sessions', state.sessions)}
      ${resourceEditor(t('Ramais'), 'extensions', state.extensions)}
      ${resourceEditor(t('Usuários'), 'users', state.users)}
      ${settingsEditor(t('Gravações'), 'recording/settings', state.recording)}
      ${settingsEditor(t('Licença'), 'license', state.license)}
    </section>`;
};
