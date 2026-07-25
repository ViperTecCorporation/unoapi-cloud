import { icon } from '../components/icons.js?v=4.0.0-beta8';
import { renderModal } from '../components/modal.js?v=4.0.0-beta8';
import { escapeHtml } from '../core/html.js?v=4.0.0-beta8';
import { formatNumber, t } from '../core/i18n.js?v=4.0.0-beta8';
import { sessionLabel, sessionPhone } from '../domain/session.js?v=4.0.0-beta8';
export const redisKeyGroup = (key) => {
    const parts = `${key || ''}`.split(':');
    return parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join(':') : 'unoapi';
};
const formattedValue = (value) => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
export const redisValueIsRedacted = (value) => value === '[REDACTED]'
    || (Array.isArray(value) && value.some(redisValueIsRedacted))
    || (!!value && typeof value === 'object' && Object.values(value).some(redisValueIsRedacted));
export const renderRedisEditorModal = (details) => {
    const key = details?.key || 'unoapi:';
    const editableType = details?.type === 'stream' || details?.type === 'none' ? 'string' : details?.type || 'string';
    return renderModal('redis-editor', details ? t('Editar chave Redis') : t('Adicionar chave Redis'), `
    <form class="stack" data-form="redis-save">
      <label class="field"><span>${t('Chave')}</span><input name="key" value="${escapeHtml(key)}" ${details ? 'readonly' : ''} required></label>
      <div class="form-grid">
        <label class="field"><span>${t('Tipo')}</span><select name="type">${['string', 'hash', 'list', 'set', 'zset'].map((type) => `<option value="${type}" ${type === editableType ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
        <label class="field"><span>TTL (${t('segundos')})</span><small class="field-help">${t('-1 mantém a chave sem expiração.')}</small><input name="ttlSeconds" type="number" value="${details?.ttl ?? -1}"></label>
      </div>
      <label class="field"><span>${t('Conteúdo em JSON ou texto')}</span><textarea name="value" rows="12" required>${escapeHtml(details ? formattedValue(details.value) : '')}</textarea></label>
      <label class="field"><span>${t('Digite o nome da chave para confirmar')}</span><input name="confirm" placeholder="${escapeHtml(key)}" required></label>
      <div class="form-actions"><button class="btn" type="submit">${icon('save')}${t('Salvar chave')}</button></div>
    </form>
  `);
};
export const renderRedisDeleteModal = (key) => renderModal('redis-delete', t('Excluir chave Redis'), `
    <form class="stack" data-form="redis-delete">
      <input type="hidden" name="key" value="${escapeHtml(key)}">
      <p>${t('Esta operação remove a chave e todo o seu conteúdo.')}</p>
      <label class="field"><span>${t('Digite o nome da chave para confirmar')}</span><input name="confirm" placeholder="${escapeHtml(key)}" required></label>
      <div class="form-actions"><button class="btn btn--danger" type="submit">${icon('trash')}${t('Excluir definitivamente')}</button></div>
    </form>
  `, { subtitle: key });
export const renderRedisPage = (options) => {
    const filtered = options.keys.filter((key) => (!options.sessionFilter || key.includes(options.sessionFilter))
        && key.toLowerCase().includes(options.query.trim().toLowerCase()));
    const grouped = new Map();
    filtered.forEach((key) => {
        const group = redisKeyGroup(key);
        grouped.set(group, [...(grouped.get(group) || []), key]);
    });
    return `
    <section class="page-header">
      <div><span class="eyebrow">Redis</span><h1>${t('Chaves e conteúdo')}</h1><p class="muted">${t('Exploração segura do cache e estado persistido do ViperConnect')}</p></div>
      <div class="actions"><button class="btn btn--ghost" type="button" data-action="refresh-redis">${icon('refresh')}${t('Atualizar agora')}</button><button class="btn" type="button" data-action="add-redis-key">${icon('plus')}${t('Adicionar chave')}</button></div>
    </section>
    <section class="section">
      <div class="section__heading"><div><h2>${t('Árvore de chaves')}</h2><p class="muted">${options.loading ? t('Atualizando…') : `${t('Atualização automática em')} <span data-refresh-countdown>${options.refreshIn}s</span>`}</p></div></div>
      <div class="filters queue-filters">
        <label class="search-field">${icon('search')}<input data-filter="redis-query" value="${escapeHtml(options.query)}" placeholder="${t('Buscar chave')}" aria-label="${t('Buscar chave')}"></label>
        <label class="field"><span>${t('Filtrar por sessão')}</span><select data-filter="redis-session"><option value="">${t('Todas as sessões')}</option>${options.sessions.map((session) => `<option value="${escapeHtml(sessionPhone(session))}" ${sessionPhone(session) === options.sessionFilter ? 'selected' : ''}>${escapeHtml(sessionLabel(session))} · ${escapeHtml(sessionPhone(session))}</option>`).join('')}</select></label>
      </div>
      ${options.error ? `<p class="form-error">${escapeHtml(options.error)}</p>` : ''}
      <div class="redis-browser">
        <div class="redis-tree">${grouped.size ? [...grouped.entries()].map(([group, keys]) => `<details ${options.selected?.key && keys.includes(options.selected.key) ? 'open' : ''}><summary>${icon('database')}<strong>${escapeHtml(group)}</strong><span>${keys.length}</span></summary><div>${keys.map((key) => `<button class="redis-key ${options.selected?.key === key ? 'redis-key--active' : ''}" type="button" data-action="select-redis-key" data-key="${escapeHtml(key)}">${escapeHtml(key)}</button>`).join('')}</div></details>`).join('') : `<div class="empty-state">${t('Nenhuma chave encontrada.')}</div>`}</div>
        <div class="redis-detail">${options.selected ? `
          <div class="section__heading"><div><h2>${escapeHtml(options.selected.key)}</h2><p class="muted">${options.selected.type} · TTL ${options.selected.ttl} · ${formatNumber(options.selected.size)} ${t('itens')}</p></div><div class="actions">${redisValueIsRedacted(options.selected.value) ? '' : `<button class="btn btn--ghost" type="button" data-action="edit-redis-key">${icon('edit')}${t('Editar')}</button>`}<button class="btn btn--danger btn--ghost" type="button" data-action="delete-redis-key">${icon('trash')}${t('Excluir')}</button></div></div>
          ${redisValueIsRedacted(options.selected.value) ? `<p class="hint">${t('A edição foi bloqueada porque o conteúdo possui campos sensíveis mascarados.')}</p>` : ''}
          ${options.selected.truncated ? `<p class="hint">${t('Conteúdo limitado aos primeiros itens para proteger o navegador.')}</p>` : ''}
          <pre>${escapeHtml(formattedValue(options.selected.value))}</pre>` : `<div class="empty-state">${t('Selecione uma chave na árvore para visualizar o conteúdo.')}</div>`}</div>
      </div>
    </section>
    <section class="section">
      <div class="section__heading"><div><h2>${t('Consulta Redis')}</h2><p class="muted">${t('Somente comandos de leitura permitidos; comandos administrativos e scripts são bloqueados.')}</p></div></div>
      <form class="redis-query-form" data-form="redis-query">
        <label class="field"><span>${t('Comando')}</span><select name="command">${['TYPE', 'TTL', 'GET', 'HGETALL', 'LRANGE', 'SMEMBERS', 'ZRANGE', 'SCAN'].map((command) => `<option>${command}</option>`).join('')}</select></label>
        <label class="field"><span>${t('Chave ou termo')}</span><input name="argument" placeholder="unoapi:..."></label>
        <button class="btn" type="submit">${icon('search')}${t('Executar consulta')}</button>
      </form>
      ${typeof options.queryResult !== 'undefined' ? `<pre class="redis-query-result">${escapeHtml(formattedValue(options.queryResult))}</pre>` : ''}
    </section>
  `;
};
