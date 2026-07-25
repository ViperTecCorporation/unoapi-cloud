import { icon } from '../components/icons.js?v=4.0.0-beta8';
import { renderModal } from '../components/modal.js?v=4.0.0-beta8';
import { renderStatus } from '../components/status.js?v=4.0.0-beta8';
import { escapeHtml } from '../core/html.js?v=4.0.0-beta8';
import { sessionLabel, sessionPhone } from '../domain/session.js?v=4.0.0-beta8';
export const renderNewSessionModal = () => renderModal('new-session', 'Nova sessão', `
    <form class="stack" data-form="new-session">
      <p class="muted">Novas sessões são registradas diretamente no motor Zapo.</p>
      <div class="form-grid">
        <label class="field"><span>Telefone</span><input name="phone" inputmode="numeric" placeholder="55 DDD número" required></label>
        <label class="field"><span>Nome da sessão</span><input name="label" placeholder="Ex.: Comercial · account 1"></label>
        <label class="field"><span>Tipo de conexão</span><select name="connectionType"><option value="qrcode">QR Code</option><option value="pairing_code">Código de pareamento</option></select></label>
      </div>
      <div class="form-actions"><button class="btn" type="submit">${icon('plus')}Registrar sessão</button></div>
    </form>
  `, { subtitle: 'Motor Zapo' });
export const renderMessageModal = (session, recipient = '') => renderModal('message-test', 'Testar mensagem', `
    <form class="stack" data-form="test-message">
      <input name="phone" type="hidden" value="${escapeHtml(sessionPhone(session))}">
      <label class="field"><span>Destinatário</span><input name="to" value="${escapeHtml(recipient)}" placeholder="Telefone, LID ou ID do grupo" required></label>
      <label class="field"><span>Mensagem</span><textarea name="body" rows="5" required></textarea></label>
      <div class="form-actions"><button class="btn" type="submit">${icon('send')}Enviar teste</button></div>
    </form>
  `, { subtitle: sessionLabel(session) });
export const renderConnectionModal = (session, broadcast, loading = false) => {
    const phone = sessionPhone(session);
    const qr = broadcast?.type === 'qrcode' && broadcast.content ? broadcast.content : '';
    const statusText = broadcast?.type === 'status' && broadcast.content
        ? broadcast.content
        : loading ? 'Solicitando pareamento…' : 'Aguardando evento da sessão';
    const method = session.connectionType === 'pairing_code' ? 'Código de pareamento' : 'QR Code';
    const pairingCode = broadcast?.type === 'qrcode' && broadcast.content && !broadcast.content.startsWith('data:image')
        ? broadcast.content
        : '';
    return renderModal('session-connection', 'Conectar sessão', `
    <div class="connection-layout">
      <div class="qr-box">
        ${qr && !pairingCode
        ? `<img src="${escapeHtml(qr)}" alt="QR Code da sessão ${escapeHtml(phone)}">`
        : pairingCode
            ? `<div class="pairing-code"><span>Código</span><strong>${escapeHtml(pairingCode)}</strong></div>`
            : `<div class="qr-placeholder">${icon('refresh')}<span>Aguardando código</span></div>`}
      </div>
      <div class="stack">
        <div>${renderStatus(session.status)} <strong>${escapeHtml(sessionLabel(session))}</strong></div>
        <dl class="details-list">
          <div><dt>Telefone</dt><dd>${escapeHtml(phone)}</dd></div>
          <div><dt>Método da sessão</dt><dd>${escapeHtml(method)}</dd></div>
          <div><dt>Servidor</dt><dd>${escapeHtml(session.server || 'server_1')}</dd></div>
        </dl>
        <p class="muted" aria-live="polite">${escapeHtml(statusText)}</p>
        <p class="hint">O tipo de conexão permanece o mesmo enquanto a sessão não receber <code>deregister</code>.</p>
        <div class="form-actions">
          <button class="btn" type="button" data-action="request-connection" data-phone="${escapeHtml(phone)}">${icon('refresh')}Gerar novo código</button>
        </div>
      </div>
    </div>
  `, { subtitle: `Sessão ${phone}`, wide: true });
};
export const renderConfirmDeregisterModal = (session) => renderModal('deregister-session', 'Desconectar sessão', `
    <div class="stack">
      <p>Esta ação executa <code>deregister</code> em <strong>${escapeHtml(sessionLabel(session))}</strong> e exigirá um novo pareamento.</p>
      <p class="form-error">${icon('warning')}As credenciais nativas da sessão serão removidas.</p>
      <div class="form-actions">
        <button class="btn btn--danger" type="button" data-action="confirm-deregister" data-phone="${escapeHtml(sessionPhone(session))}">${icon('trash')}Confirmar desconexão</button>
      </div>
    </div>
  `);
