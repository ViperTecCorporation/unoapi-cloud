import { icon } from '../components/icons.js'
import { renderModal } from '../components/modal.js'
import { renderStatus } from '../components/status.js'
import { escapeHtml } from '../core/html.js'
import type { WebhookConfig } from '../domain/types.js'

const webhookDestination = (webhook: WebhookConfig): string =>
  `${webhook.urlAbsolute || webhook.url || ''}`.trim()

const isEnabled = (webhook: WebhookConfig): boolean =>
  webhook.enabled !== false && webhook.disabled !== true && !!webhookDestination(webhook)

export const renderWebhooks = (webhooks: WebhookConfig[]): string => `
  <div class="section__heading">
    <div><h2>Webhooks</h2><p class="muted">Destinos vinculados exclusivamente a esta sessão.</p></div>
    <button class="btn" type="button" data-action="new-webhook">${icon('plus')}Adicionar webhook</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Status</th><th>Destino</th><th class="table-actions">Ação</th></tr></thead>
      <tbody>
        ${webhooks.length ? webhooks.map((webhook, index) => `
          <tr>
            <td>${renderStatus(isEnabled(webhook) ? 'online' : 'offline')}</td>
            <td class="destination">${escapeHtml(webhookDestination(webhook) || 'Destino não configurado')}</td>
            <td class="table-actions"><button class="btn btn--ghost" type="button" data-action="edit-webhook" data-webhook-index="${index}">${icon('edit')}Editar</button></td>
          </tr>
        `).join('') : '<tr><td colspan="3"><div class="empty-state">Nenhum webhook configurado.</div></td></tr>'}
      </tbody>
    </table>
  </div>
`

const checkbox = (name: string, label: string, value: boolean | undefined, defaultValue = false): string => `
  <label class="switch-field">
    <input name="${name}" type="checkbox" ${(value ?? defaultValue) ? 'checked' : ''}>
    <span><strong>${label}</strong></span>
  </label>
`

export const renderWebhookModal = (webhook: WebhookConfig, index: number): string =>
  renderModal('webhook-editor', index >= 0 ? 'Editar webhook' : 'Novo webhook', `
    <form class="stack" data-form="webhook" data-webhook-index="${index}">
      <div class="form-grid">
        <label class="field"><span>ID</span><input name="id" value="${escapeHtml(webhook.id || 'default')}" required></label>
        <label class="field"><span>Destino</span><input name="urlAbsolute" type="url" value="${escapeHtml(webhookDestination(webhook))}" placeholder="https://app.exemplo.com/webhook" required></label>
        <label class="field"><span>Header</span><input name="header" value="${escapeHtml(webhook.header || 'Authorization')}"></label>
        <label class="field"><span>Token</span><input name="token" type="password" value="${escapeHtml(webhook.token || '')}" autocomplete="off"></label>
        <label class="field"><span>Timeout (ms)</span><input name="timeoutMs" type="number" min="1000" value="${escapeHtml(webhook.timeoutMs || 360000)}"></label>
        <label class="field"><span>Blacklist na saída (segundos)</span><input name="addToBlackListOnOutgoingMessageWithTtl" type="number" min="0" value="${escapeHtml(webhook.addToBlackListOnOutgoingMessageWithTtl || '')}"></label>
      </div>
      <div class="switch-grid">
        ${checkbox('enabled', 'Webhook ativo', webhook.enabled !== false && webhook.disabled !== true, true)}
        ${checkbox('sendNewMessages', 'Novas mensagens', webhook.sendNewMessages)}
        ${checkbox('sendIncomingMessages', 'Mensagens recebidas', webhook.sendIncomingMessages, true)}
        ${checkbox('sendOutgoingMessages', 'Mensagens enviadas', webhook.sendOutgoingMessages, true)}
        ${checkbox('sendUpdateMessages', 'Atualizações de mensagens', webhook.sendUpdateMessages, true)}
        ${checkbox('sendGroupMessages', 'Mensagens de grupos', webhook.sendGroupMessages, true)}
        ${checkbox('sendNewsletterMessages', 'Mensagens de newsletter', webhook.sendNewsletterMessages)}
        ${checkbox('sendTranscribeAudio', 'Transcrição de áudio', webhook.sendTranscribeAudio)}
        ${checkbox('typebot', 'Payload Typebot', webhook.typebot)}
      </div>
      <div class="form-actions">
        ${index >= 0 ? `<button class="btn btn--danger btn--ghost" type="button" data-action="delete-webhook" data-webhook-index="${index}">${icon('trash')}Remover</button>` : ''}
        <button class="btn" type="submit">${icon('save')}Salvar webhook</button>
      </div>
    </form>
  `, { subtitle: 'Configuração da sessão', wide: true })

const numericValue = (data: FormData, name: string, fallback: number): number => {
  const value = Number(data.get(name))
  return Number.isFinite(value) ? value : fallback
}

export const webhookPayload = (data: FormData): WebhookConfig => ({
  id: `${data.get('id') || 'default'}`.trim(),
  url: '',
  urlAbsolute: `${data.get('urlAbsolute') || ''}`.trim(),
  enabled: data.has('enabled'),
  token: `${data.get('token') || ''}`,
  header: `${data.get('header') || 'Authorization'}`.trim(),
  timeoutMs: Math.max(1000, numericValue(data, 'timeoutMs', 360000)),
  sendNewMessages: data.has('sendNewMessages'),
  sendIncomingMessages: data.has('sendIncomingMessages'),
  sendOutgoingMessages: data.has('sendOutgoingMessages'),
  sendUpdateMessages: data.has('sendUpdateMessages'),
  sendGroupMessages: data.has('sendGroupMessages'),
  sendNewsletterMessages: data.has('sendNewsletterMessages'),
  sendTranscribeAudio: data.has('sendTranscribeAudio'),
  typebot: data.has('typebot'),
  addToBlackListOnOutgoingMessageWithTtl: Math.max(
    0,
    numericValue(data, 'addToBlackListOnOutgoingMessageWithTtl', 0),
  ),
})
