import { renderAvatar } from '../components/avatar.js?v=4.0.0-beta8';
import { icon } from '../components/icons.js?v=4.0.0-beta8';
import { escapeHtml } from '../core/html.js?v=4.0.0-beta8';
const contactName = (contact) => contact.display_name || contact.push_name || contact.username || contact.phone_number || contact.user_id;
export const filterContacts = (contacts, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle)
        return contacts;
    return contacts.filter((contact) => [contactName(contact), contact.phone_number, contact.user_id, contact.username].some((value) => `${value || ''}`.toLowerCase().includes(needle)));
};
export const filterGroups = (groups, query) => {
    const needle = query.trim().toLowerCase();
    if (!needle)
        return groups;
    return groups.filter((group) => [group.subject, group.id, group.jid].some((value) => `${value || ''}`.toLowerCase().includes(needle)));
};
export const renderContactCards = (contacts, sessionPhone = '') => {
    if (!contacts.length)
        return '<div class="empty-state">Nenhum contato sincronizado para esta sessão.</div>';
    return `<div class="entity-grid">${contacts
        .map((contact) => {
        const name = contactName(contact);
        return `<article class="entity-card">
      ${renderAvatar(contact.picture, `Foto de ${name}`, 'contact')}
      <div class="entity-card__body">
        <strong>${escapeHtml(name)}</strong>
        ${contact.phone_number ? `<span>${escapeHtml(contact.phone_number)}</span>` : ''}
        <small>${escapeHtml(contact.user_id)}</small>
        ${contact.username ? `<small>@${escapeHtml(contact.username.replace(/^@/, ''))}</small>` : ''}
        <div class="entity-card__actions">
          <button class="btn btn--icon btn--ghost" type="button" data-action="test-message" data-phone="${escapeHtml(sessionPhone)}" data-recipient="${escapeHtml(contact.user_id)}" aria-label="Enviar mensagem para ${escapeHtml(name)}" title="Enviar mensagem">${icon('send')}</button>
          ${contact.phone_number ? `<button class="btn btn--icon btn--ghost" type="button" data-action="copy-value" data-value="${escapeHtml(contact.phone_number)}" data-copy-label="Telefone" aria-label="Copiar telefone de ${escapeHtml(name)}" title="Copiar telefone">${icon('copy')}</button>` : ''}
        </div>
      </div>
    </article>`;
    })
        .join('')}</div>`;
};
export const renderGroupCards = (groups, sessionPhone = '') => {
    if (!groups.length)
        return '<div class="empty-state">Nenhum grupo sincronizado para esta sessão.</div>';
    return `<div class="entity-grid">${groups
        .map((group) => {
        const id = group.id || group.jid || '';
        const name = group.subject || id || 'Grupo sem nome';
        const count = group.participants_count ?? group.participantsCount ?? group.total_participant_count ?? 0;
        return `<article class="entity-card">
      ${renderAvatar(group.picture, `Foto do grupo ${name}`, 'group')}
      <div class="entity-card__body">
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(count)} participantes</span>
        <small>${escapeHtml(id)}</small>
        <div class="entity-card__actions">
          <button class="btn btn--icon btn--ghost" type="button" data-action="test-message" data-phone="${escapeHtml(sessionPhone)}" data-recipient="${escapeHtml(id)}" aria-label="Enviar mensagem para o grupo ${escapeHtml(name)}" title="Enviar mensagem">${icon('send')}</button>
          <button class="btn btn--icon btn--ghost" type="button" data-action="copy-value" data-value="${escapeHtml(id)}" data-copy-label="Identificador do grupo" aria-label="Copiar identificador do grupo ${escapeHtml(name)}" title="Copiar identificador">${icon('copy')}</button>
        </div>
      </div>
    </article>`;
    })
        .join('')}</div>`;
};
