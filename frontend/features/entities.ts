import { renderAvatar } from '../components/avatar.js'
import { escapeHtml } from '../core/html.js'
import type { ContactDirectoryItem, GroupSummary } from '../domain/types.js'

const contactName = (contact: ContactDirectoryItem): string =>
  contact.display_name || contact.push_name || contact.username || contact.phone_number || contact.user_id

export const renderContactCards = (contacts: ContactDirectoryItem[]): string => {
  if (!contacts.length) return '<div class="empty-state">Nenhum contato sincronizado para esta sessão.</div>'
  return `<div class="entity-grid">${contacts.map((contact) => {
    const name = contactName(contact)
    return `<article class="entity-card">
      ${renderAvatar(contact.picture, `Foto de ${name}`, 'contact')}
      <div class="entity-card__body">
        <strong>${escapeHtml(name)}</strong>
        ${contact.phone_number ? `<span>${escapeHtml(contact.phone_number)}</span>` : ''}
        <small>${escapeHtml(contact.user_id)}</small>
        ${contact.username ? `<small>@${escapeHtml(contact.username.replace(/^@/, ''))}</small>` : ''}
      </div>
    </article>`
  }).join('')}</div>`
}

export const renderGroupCards = (groups: GroupSummary[]): string => {
  if (!groups.length) return '<div class="empty-state">Nenhum grupo sincronizado para esta sessão.</div>'
  return `<div class="entity-grid">${groups.map((group) => {
    const id = group.id || group.jid || ''
    const name = group.subject || id || 'Grupo sem nome'
    const count = group.participants_count ?? group.participantsCount ?? group.total_participant_count ?? 0
    return `<article class="entity-card">
      ${renderAvatar(group.picture, `Foto do grupo ${name}`, 'group')}
      <div class="entity-card__body">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(count)} participantes</span>
        <small>${escapeHtml(id)}</small>
      </div>
    </article>`
  }).join('')}</div>`
}
