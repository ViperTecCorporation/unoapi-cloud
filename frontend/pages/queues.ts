import { renderInfoTooltip } from '../components/form_controls.js'
import { icon } from '../components/icons.js'
import { renderModal } from '../components/modal.js'
import { escapeHtml } from '../core/html.js'
import { formatNumber, t, type TranslationKey } from '../core/i18n.js'
import { sessionLabel, sessionPhone } from '../domain/session.js'
import type { RabbitQueueInfo, RabbitQueueMessage, SessionConfig } from '../domain/types.js'

export const queueDescriptionKey = (name: string): TranslationKey => {
  if (name.endsWith('.dead')) return 'Mensagens que esgotaram as tentativas e aguardam análise ou remoção.'
  if (name.endsWith('.delayed')) return 'Mensagens aguardando o tempo configurado para nova tentativa ou execução.'
  if (name.includes('.outgoing')) return 'Entrega eventos e webhooks do ViperConnect às aplicações cadastradas.'
  if (name.includes('.incoming')) return 'Recebe comandos de envio destinados aos workers e sessões do WhatsApp.'
  if (name.includes('.listener')) return 'Transporta eventos recebidos do WhatsApp para o processamento da UnoAPI.'
  if (name.includes('.media')) return 'Processa download, armazenamento e preparação de mídias.'
  if (name.includes('.transcribe')) return 'Processa transcrição de mensagens de áudio.'
  if (name.includes('.bind')) return 'Vincula sessões às filas do servidor e motor responsáveis.'
  if (name.includes('.reload')) return 'Transporta solicitações de conexão e recarga das sessões.'
  if (name.includes('.logout')) return 'Transporta solicitações de desconexão e logout das sessões.'
  if (name.includes('.bulk')) return 'Processa etapas de envios em lote e seus relatórios.'
  if (name.includes('.timer')) return 'Agenda ações que precisam executar após um intervalo.'
  if (name.includes('.broadcast')) return 'Distribui eventos internos entre processos do ViperConnect.'
  if (name.includes('.notification')) return 'Processa notificações auxiliares e avisos de falha.'
  if (name.includes('.blacklist')) return 'Atualiza a blacklist temporária usada pelos webhooks.'
  if (name.includes('.commander')) return 'Recebe comandos de orquestração dos envios em lote.'
  return 'Fila interna do ViperConnect gerenciada pelo RabbitMQ.'
}

export const queueNeedsAttention = (queue: RabbitQueueInfo): boolean =>
  `${queue.state || 'running'}` !== 'running' || (queue.messages_ready > 0 && queue.consumers === 0)

export const filterQueuesBySession = (
  queues: RabbitQueueInfo[],
  session?: SessionConfig,
): RabbitQueueInfo[] => {
  if (!session) return queues
  const server = `${session.server || 'server_1'}`
  const provider = `${session.provider || 'zapo'}`
  return queues.filter((queue) => {
    if (!queue.name.includes('.server_')) return true
    if (!queue.name.includes(`.${server}`)) return false
    if (queue.name.includes('.zapo') || queue.name.includes('.baileys')) {
      return queue.name.includes(`.${provider}`)
    }
    return true
  })
}

const renderMessages = (messages: RabbitQueueMessage[]): string => {
  if (!messages.length) return `<div class="empty-state">${t('Nenhuma mensagem encontrada na amostra.')}</div>`
  return `<div class="queue-messages">${messages.map((message, index) => `
    <article class="queue-message">
      <div class="queue-message__header">
        <strong>${t('Mensagem {index}', { index: index + 1 })}</strong>
        <span class="muted">${escapeHtml(message.routing_key || message.exchange || '-')} · ${message.redelivered ? t('Reentregue') : t('Nova')}</span>
      </div>
      <pre>${escapeHtml(JSON.stringify(message.payload, null, 2))}</pre>
    </article>`).join('')}</div>`
}

export const renderQueuePurgeModal = (queue: string): string =>
  renderModal('queue-purge', t('Limpar mensagens da fila'), `
    <form class="stack" data-form="queue-purge">
      <input type="hidden" name="queue" value="${escapeHtml(queue)}">
      <p>${t('A limpeza remove mensagens prontas e não afeta itens já entregues a consumidores.')}</p>
      <label class="field"><span>${t('Quantidade')}</span><select name="count"><option value="1">${t('Uma mensagem')}</option><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">${t('Todas as mensagens prontas')}</option></select></label>
      <label class="field"><span>${t('Digite o nome da fila para confirmar')}</span><input name="confirm" autocomplete="off" placeholder="${escapeHtml(queue)}" required></label>
      <div class="form-actions"><button class="btn btn--danger" type="submit">${icon('trash')}${t('Limpar definitivamente')}</button></div>
    </form>
  `, { subtitle: queue })

interface QueuePageOptions {
  queues: RabbitQueueInfo[]
  sessions: SessionConfig[]
  sessionPhoneFilter: string
  query: string
  loading: boolean
  refreshIn: number
  visibleLimit: number
  selectedQueue: string
  messages: RabbitQueueMessage[]
  messagesLoading: boolean
  error: string
}

export const renderQueuesPage = (options: QueuePageOptions): string => {
  const session = options.sessions.find((item) => sessionPhone(item) === options.sessionPhoneFilter)
  const filtered = filterQueuesBySession(options.queues, session)
    .filter((queue) => queue.name.toLowerCase().includes(options.query.trim().toLowerCase()))
  const visible = filtered.slice(0, options.visibleLimit)
  const ready = filtered.reduce((total, queue) => total + queue.messages_ready, 0)
  const dead = filtered.filter((queue) => queue.name.endsWith('.dead')).reduce((total, queue) => total + queue.messages_ready, 0)
  const consumers = filtered.reduce((total, queue) => total + queue.consumers, 0)

  return `
    <section class="page-header">
      <div><span class="eyebrow">RabbitMQ</span><h1>${t('Filas')}</h1><p class="muted">${t('Acompanhamento e inspeção das filas do ViperConnect')}</p></div>
      <button class="btn btn--ghost" type="button" data-action="refresh-queues">${icon('refresh')}${t('Atualizar agora')}</button>
    </section>
    <section class="stats">
      <article class="stat-card"><span>${t('Mensagens prontas')}</span><strong>${formatNumber(ready)}</strong><small>${t('aguardando processamento')}</small></article>
      <article class="stat-card"><span>Dead-letter</span><strong>${formatNumber(dead)}</strong><small>${t('aguardando análise')}</small></article>
      <article class="stat-card"><span>${t('Consumidores')}</span><strong>${formatNumber(consumers)}</strong><small>${t('processos ativos')}</small></article>
    </section>
    <section class="section">
      <div class="section__heading">
        <div><h2>${t('Filas do RabbitMQ')}</h2><p class="muted">${options.loading ? t('Atualizando…') : `${t('Atualização automática em')} <span data-refresh-countdown>${options.refreshIn}s</span>`}</p></div>
      </div>
      <div class="filters queue-filters">
        <label class="search-field">${icon('search')}<input data-filter="queues-query" value="${escapeHtml(options.query)}" placeholder="${t('Buscar fila')}" aria-label="${t('Buscar fila')}"></label>
        <label class="field"><span>${t('Filtrar por sessão')}</span><select data-filter="queues-session">
          <option value="">${t('Todas as sessões')}</option>
          ${options.sessions.map((item) => `<option value="${escapeHtml(sessionPhone(item))}" ${sessionPhone(item) === options.sessionPhoneFilter ? 'selected' : ''}>${escapeHtml(sessionLabel(item))} · ${escapeHtml(sessionPhone(item))}</option>`).join('')}
        </select></label>
      </div>
      ${options.error ? `<p class="form-error">${escapeHtml(options.error)}</p>` : ''}
      <div class="table-wrap">
        <table class="queue-table">
          <thead><tr><th>${t('Fila')}</th><th>${t('Prontas')}</th><th>${t('Em processamento')}</th><th>${t('Consumidores')}</th><th>${t('Estado')}</th><th class="table-actions">${t('Ações')}</th></tr></thead>
          <tbody>${visible.length ? visible.map((queue) => {
            const attention = queueNeedsAttention(queue)
            return `<tr class="${queue.name === options.selectedQueue ? 'row--selected' : ''}">
              <td><div class="queue-name"><strong>${escapeHtml(queue.name)}</strong>${renderInfoTooltip(t(queueDescriptionKey(queue.name)))}</div></td>
              <td>${formatNumber(queue.messages_ready)}</td>
              <td>${formatNumber(queue.messages_unacknowledged)}</td>
              <td>${formatNumber(queue.consumers)}</td>
              <td><span class="queue-state queue-state--${attention ? 'danger' : 'healthy'}"><span></span>${attention ? t('Atenção') : t('Normal')}</span></td>
              <td class="table-actions"><div class="row-actions">
                <button class="btn btn--ghost" type="button" data-action="inspect-queue" data-queue="${escapeHtml(queue.name)}">${icon('search')}${t('Inspecionar')}</button>
                <button class="btn btn--icon btn--ghost" type="button" data-action="open-queue-purge" data-queue="${escapeHtml(queue.name)}" aria-label="${t('Limpar fila')}">${icon('trash')}</button>
              </div></td>
            </tr>`
          }).join('') : `<tr><td colspan="6"><div class="empty-state">${t('Nenhuma fila encontrada.')}</div></td></tr>`}</tbody>
        </table>
      </div>
      ${filtered.length > visible.length ? `<div class="load-more"><button class="btn btn--ghost" type="button" data-action="load-more-queues">${t('Carregar mais')} <span>${visible.length}/${filtered.length}</span></button></div>` : ''}
    </section>
    ${options.selectedQueue ? `<section class="section queue-inspector">
      <div class="section__heading"><div><h2>${escapeHtml(options.selectedQueue)}</h2><p class="muted">${t('A amostra é lida e recolocada na fila; nenhuma mensagem é removida.')}</p></div>
        <button class="btn btn--danger btn--ghost" type="button" data-action="open-queue-purge" data-queue="${escapeHtml(options.selectedQueue)}">${icon('trash')}${t('Limpar mensagens')}</button>
      </div>
      ${options.messagesLoading ? `<div class="loading-state">${t('Carregando mensagens…')}</div>` : renderMessages(options.messages)}
    </section>` : ''}
  `
}
