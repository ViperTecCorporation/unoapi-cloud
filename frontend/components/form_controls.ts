import { escapeHtml } from '../core/html.js'
import { icon } from './icons.js'

export const renderInfoTooltip = (description: string): string => `
  <button class="info-tooltip" type="button" data-action="toggle-tooltip"
    data-tooltip="${escapeHtml(description)}" aria-label="${escapeHtml(description)}"
    aria-expanded="false">${icon('info')}</button>
`

export const renderSwitchField = (name: string, label: string, description: string, enabled: boolean): string => `
  <div class="switch-field">
    <label>
      <input name="${escapeHtml(name)}" type="checkbox" ${enabled ? 'checked' : ''}>
      <strong>${escapeHtml(label)}</strong>
    </label>
    ${renderInfoTooltip(description)}
  </div>
`

export const renderSecretField = (name: string, label: string, value: unknown): string => {
  const inputId = `secret-${name.replace(/[^a-z0-9_-]/gi, '-')}`
  return `
  <div class="field">
    <label for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
    <span class="secret-field">
      <input id="${escapeHtml(inputId)}" name="${escapeHtml(name)}" type="password" value="${escapeHtml(value)}" autocomplete="off">
      <button type="button" class="btn btn--icon btn--ghost" data-action="toggle-secret" aria-label="Exibir ${escapeHtml(label)}" aria-pressed="false">${icon('eye')}</button>
      <button type="button" class="btn btn--icon btn--ghost" data-action="copy-secret" aria-label="Copiar ${escapeHtml(label)}">${icon('copy')}</button>
    </span>
  </div>
`
}
