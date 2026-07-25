import { escapeHtml } from '../core/html.js';
import { icon } from '../components/icons.js';
export const booleanSessionFields = [
    ['autoConnect', 'Conectar automaticamente'],
    ['ignoreGroupMessages', 'Ignorar mensagens de grupos'],
    ['ignoreNewsletterMessages', 'Ignorar newsletters'],
    ['ignoreHistoryMessages', 'Ignorar histórico de mensagens'],
    ['readOnReceipt', 'Ler ao receber'],
    ['readOnReply', 'Ler ao responder'],
    ['markOnlineOnConnect', 'Marcar online ao conectar'],
    ['sendProfilePicture', 'Enviar foto de perfil no webhook'],
    ['sendConnectionStatus', 'Enviar status da conexão'],
    ['notifyFailedMessages', 'Notificar mensagens com falha'],
    ['composingMessage', 'Enviar “digitando”'],
    ['sendReactionAsReply', 'Enviar reação como resposta'],
    ['ignoreOwnMessages', 'Ignorar mensagens próprias'],
    ['ignoreYourselfMessages', 'Ignorar mensagens para si mesmo'],
    ['ignoreBroadcastStatuses', 'Ignorar Status'],
    ['ignoreBroadcastMessages', 'Ignorar listas de transmissão'],
];
const checked = (value) => value === true ? 'checked' : '';
export const renderSessionConfig = (session) => `
  <form class="stack" data-form="session-config">
    <section class="section">
      <div class="section__heading">
        <div><h3>Identificação e conexão</h3><p class="muted">Configuração exclusiva desta sessão. O motor padrão é Zapo e não é selecionável no front.</p></div>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Nome da sessão</span>
          <input name="label" value="${escapeHtml(session.label || '')}">
        </label>
        <label class="field">
          <span>Telefone</span>
          <input value="${escapeHtml(session.phone || session.id || '')}" disabled>
        </label>
        <label class="field">
          <span>Tipo de conexão</span>
          <input name="connectionType" type="hidden" value="${session.connectionType === 'pairing_code' ? 'pairing_code' : 'qrcode'}">
          <select disabled aria-describedby="connection-type-hint">
            <option value="qrcode" ${session.connectionType !== 'pairing_code' ? 'selected' : ''}>QR Code</option>
            <option value="pairing_code" ${session.connectionType === 'pairing_code' ? 'selected' : ''}>Código de pareamento</option>
          </select>
          <small id="connection-type-hint">Para trocar o método, execute deregister e registre a sessão novamente.</small>
        </label>
        <label class="field">
          <span>Servidor</span>
          <input name="server" value="${escapeHtml(session.server || 'server_1')}">
        </label>
        <label class="field field--wide">
          <span>Proxy</span>
          <input name="proxyUrl" value="${escapeHtml(session.proxyUrl || '')}" placeholder="socks5://usuario:senha@host:porta">
        </label>
        <label class="field">
          <span>Token da sessão</span>
          <input name="authToken" type="password" value="${escapeHtml(session.authToken || '')}" autocomplete="off">
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section__heading"><div><h3>Mensagens e comportamento</h3><p class="muted">Leitura, histórico, presença e eventos enviados à aplicação.</p></div></div>
      <div class="switch-grid">
        ${booleanSessionFields.map(([name, label]) => `
          <label class="switch-field">
            <input name="${name}" type="checkbox" ${checked(session[name])}>
            <span><strong>${label}</strong></span>
          </label>
        `).join('')}
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Janela do histórico (dias)</span>
          <input name="historyMaxAgeDays" type="number" min="1" max="3650" value="${escapeHtml(session.historyMaxAgeDays || 30)}">
        </label>
        <label class="field field--wide">
          <span>Mensagem ao rejeitar chamadas</span>
          <textarea name="rejectCalls" rows="3">${escapeHtml(session.rejectCalls || '')}</textarea>
        </label>
        <label class="field field--wide">
          <span>Mensagem de chamada recebida/rejeitada no webhook</span>
          <textarea name="rejectCallsWebhook" rows="3">${escapeHtml(session.rejectCallsWebhook || '')}</textarea>
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section__heading"><div><h3>Áudio e IA</h3><p class="muted">Credenciais permanecem vinculadas somente à sessão.</p></div></div>
      <div class="form-grid">
        <label class="field"><span>OpenAI API key</span><input name="openaiApiKey" type="password" value="${escapeHtml(session.openaiApiKey || '')}" autocomplete="off"></label>
        <label class="field"><span>Modelo OpenAI</span><input name="openaiApiTranscribeModel" value="${escapeHtml(session.openaiApiTranscribeModel || 'whisper-1')}"></label>
        <label class="field"><span>Groq API key</span><input name="groqApiKey" type="password" value="${escapeHtml(session.groqApiKey || '')}" autocomplete="off"></label>
        <label class="field"><span>Modelo Groq</span><input name="groqApiTranscribeModel" value="${escapeHtml(session.groqApiTranscribeModel || 'whisper-large-v3')}"></label>
        <label class="field field--wide"><span>URL base Groq</span><input name="groqApiBaseUrl" value="${escapeHtml(session.groqApiBaseUrl || 'https://api.groq.com/openai/v1')}"></label>
      </div>
    </section>

    <section class="section">
      <div class="section__heading"><div><h3>Limites por sessão</h3><p class="muted">Use zero para desativar o limite correspondente.</p></div></div>
      <div class="form-grid form-grid--three">
        <label class="field"><span>Global por minuto</span><input name="rateLimitGlobalPerMinute" type="number" min="0" value="${escapeHtml(session.rateLimitGlobalPerMinute || 0)}"></label>
        <label class="field"><span>Por destinatário/minuto</span><input name="rateLimitPerToPerMinute" type="number" min="0" value="${escapeHtml(session.rateLimitPerToPerMinute || 0)}"></label>
        <label class="field"><span>Bloqueio (segundos)</span><input name="rateLimitBlockSeconds" type="number" min="0" value="${escapeHtml(session.rateLimitBlockSeconds || 60)}"></label>
      </div>
    </section>

    <div class="form-actions">
      <button class="btn" type="submit">${icon('save')}Salvar alterações</button>
    </div>
  </form>
`;
const numberValue = (data, key, fallback) => {
    const value = Number(data.get(key));
    return Number.isFinite(value) ? value : fallback;
};
export const sessionConfigPayload = (data) => {
    const payload = {
        label: `${data.get('label') || ''}`.trim(),
        connectionType: `${data.get('connectionType') || 'qrcode'}`,
        server: `${data.get('server') || 'server_1'}`.trim(),
        proxyUrl: `${data.get('proxyUrl') || ''}`.trim(),
        authToken: `${data.get('authToken') || ''}`,
        historyMaxAgeDays: Math.max(1, numberValue(data, 'historyMaxAgeDays', 30)),
        rejectCalls: `${data.get('rejectCalls') || ''}`,
        rejectCallsWebhook: `${data.get('rejectCallsWebhook') || ''}`,
        openaiApiKey: `${data.get('openaiApiKey') || ''}`,
        openaiApiTranscribeModel: `${data.get('openaiApiTranscribeModel') || 'whisper-1'}`,
        groqApiKey: `${data.get('groqApiKey') || ''}`,
        groqApiTranscribeModel: `${data.get('groqApiTranscribeModel') || 'whisper-large-v3'}`,
        groqApiBaseUrl: `${data.get('groqApiBaseUrl') || 'https://api.groq.com/openai/v1'}`,
        rateLimitGlobalPerMinute: Math.max(0, numberValue(data, 'rateLimitGlobalPerMinute', 0)),
        rateLimitPerToPerMinute: Math.max(0, numberValue(data, 'rateLimitPerToPerMinute', 0)),
        rateLimitBlockSeconds: Math.max(0, numberValue(data, 'rateLimitBlockSeconds', 60)),
    };
    booleanSessionFields.forEach(([name]) => {
        payload[name] = data.has(name);
    });
    return payload;
};
