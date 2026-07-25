import { ApiClient, ApiError } from './core/api.js';
import { digitsOnly, escapeHtml } from './core/html.js';
import { SocketBridge } from './core/socket.js';
import { renderLayout, renderLogin } from './components/layout.js';
import { sessionPhone } from './domain/session.js';
import { sessionConfigPayload } from './features/session_config.js';
import { renderConfirmDeregisterModal, renderConnectionModal, renderMessageModal, renderNewSessionModal, } from './features/session_modals.js';
import { renderWebhookModal, webhookPayload } from './features/webhooks.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderSessionPage } from './pages/session.js';
const TOKEN_KEY = 'whatsappApiToken';
const THEME_KEY = 'viperconnect_theme';
const SIDEBAR_KEY = 'viperconnect_sidebar_collapsed';
const REFRESH_SECONDS = 15;
const emptyContactState = () => ({
    items: [],
    cursor: '0',
    hasMore: false,
});
export class ViperConnectApp {
    constructor(root, baseUrl = window.location.origin, api = new ApiClient(baseUrl), socket = new SocketBridge(baseUrl)) {
        this.root = root;
        this.sessions = [];
        this.selectedPhone = '';
        this.tab = 'overview';
        this.query = '';
        this.statusFilter = 'all';
        this.contacts = emptyContactState();
        this.groups = [];
        this.loading = false;
        this.loadingSection = false;
        this.sectionError = '';
        this.loginError = '';
        this.refreshIn = REFRESH_SECONDS;
        this.connectionLoading = false;
        this.collapsed = localStorage.getItem(SIDEBAR_KEY) === 'true';
        this.mobileOpen = false;
        this.toast = '';
        this.api = api;
        this.socket = socket;
        this.bindEvents();
    }
    async start() {
        this.applySavedTheme();
        const token = localStorage.getItem(TOKEN_KEY) || '';
        if (!token) {
            this.render();
            return;
        }
        this.api.setToken(token);
        try {
            await this.loadSessions(true);
            this.startRefreshTimer();
        }
        catch { }
    }
    bindEvents() {
        this.root.addEventListener('click', (event) => {
            void this.handleClick(event);
        });
        this.root.addEventListener('submit', (event) => {
            void this.handleSubmit(event);
        });
        this.root.addEventListener('input', (event) => this.handleFilter(event));
        this.root.addEventListener('change', (event) => this.handleFilter(event));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.modal)
                this.closeModal();
        });
    }
    async handleClick(event) {
        const target = event.target;
        const actionElement = target.closest('[data-action]');
        const closeModal = target.closest('[data-close-modal]');
        const backdrop = target.matches('[data-modal-backdrop]');
        if (closeModal || backdrop) {
            this.closeModal();
            return;
        }
        if (!actionElement)
            return;
        const action = actionElement.dataset.action || '';
        const phone = actionElement.dataset.phone || '';
        if (action === 'toggle-sidebar') {
            this.collapsed = !this.collapsed;
            localStorage.setItem(SIDEBAR_KEY, `${this.collapsed}`);
            this.render();
        }
        else if (action === 'toggle-mobile-menu') {
            this.mobileOpen = !this.mobileOpen;
            this.render();
        }
        else if (action === 'toggle-theme') {
            this.toggleTheme();
        }
        else if (action === 'logout') {
            this.logout();
        }
        else if (action === 'go-dashboard') {
            this.selectedPhone = '';
            this.tab = 'overview';
            this.mobileOpen = false;
            this.render();
        }
        else if (action === 'refresh') {
            await this.loadSessions().catch(() => undefined);
        }
        else if (action === 'new-session') {
            this.modal = { type: 'new-session' };
            this.render();
        }
        else if (action === 'manage-session') {
            this.openSession(phone);
        }
        else if (action === 'session-tab') {
            await this.openSessionTab(actionElement.dataset.tab);
        }
        else if (action === 'connect-session') {
            await this.openConnection(phone);
        }
        else if (action === 'request-connection') {
            await this.requestConnection(phone);
        }
        else if (action === 'test-message') {
            this.modal = { type: 'message', phone };
            this.render();
        }
        else if (action === 'deregister-session') {
            this.modal = { type: 'deregister', phone };
            this.render();
        }
        else if (action === 'confirm-deregister') {
            await this.deregister(phone);
        }
        else if (action === 'reload-contacts') {
            await this.loadContacts(true);
        }
        else if (action === 'load-more-contacts') {
            await this.loadContacts(false);
        }
        else if (action === 'reload-groups') {
            await this.loadGroups();
        }
        else if (action === 'new-webhook') {
            this.modal = { type: 'webhook', phone: this.selectedPhone, index: -1 };
            this.render();
        }
        else if (action === 'edit-webhook') {
            this.modal = {
                type: 'webhook',
                phone: this.selectedPhone,
                index: Number(actionElement.dataset.webhookIndex),
            };
            this.render();
        }
        else if (action === 'delete-webhook') {
            await this.deleteWebhook(Number(actionElement.dataset.webhookIndex));
        }
    }
    async handleSubmit(event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.dataset.form)
            return;
        event.preventDefault();
        const data = new FormData(form);
        if (form.dataset.form === 'login') {
            await this.login(`${data.get('token') || ''}`);
        }
        else if (form.dataset.form === 'new-session') {
            await this.createSession(data);
        }
        else if (form.dataset.form === 'session-config') {
            await this.saveSessionConfig(data);
        }
        else if (form.dataset.form === 'webhook') {
            await this.saveWebhook(data, Number(form.dataset.webhookIndex));
        }
        else if (form.dataset.form === 'test-message') {
            await this.sendTestMessage(data);
        }
    }
    handleFilter(event) {
        const input = event.target;
        if (input.dataset.filter === 'query') {
            this.query = input.value;
            this.render();
            const next = this.root.querySelector('[data-filter="query"]');
            next?.focus();
            next?.setSelectionRange(next.value.length, next.value.length);
        }
        else if (input.dataset.filter === 'status') {
            this.statusFilter = input.value;
            this.render();
        }
    }
    async login(token) {
        this.api.setToken(token);
        this.loginError = '';
        try {
            await this.loadSessions(true);
            localStorage.setItem(TOKEN_KEY, token.trim());
            this.startRefreshTimer();
        }
        catch (error) {
            this.api.setToken('');
            this.loginError = this.messageFor(error);
            this.render();
        }
    }
    logout() {
        localStorage.removeItem(TOKEN_KEY);
        this.api.setToken('');
        this.sessions = [];
        this.selectedPhone = '';
        this.modal = undefined;
        this.socket.clear();
        this.render();
    }
    async loadSessions(initial = false) {
        if (this.loading)
            return;
        this.loading = true;
        if (!initial)
            this.render();
        try {
            this.sessions = await this.api.sessions();
            this.refreshIn = REFRESH_SECONDS;
            this.loginError = '';
            if (this.selectedPhone) {
                const selected = this.findSession(this.selectedPhone);
                if (!selected)
                    this.selectedPhone = '';
            }
        }
        catch (error) {
            if (error instanceof ApiError && [401, 403].includes(error.status)) {
                localStorage.removeItem(TOKEN_KEY);
                this.api.setToken('');
                this.loginError = 'Token inválido ou sem permissão.';
            }
            else {
                this.showToast(this.messageFor(error));
            }
            throw error;
        }
        finally {
            this.loading = false;
            this.render();
        }
    }
    tickRefresh() {
        if (!this.api.getToken() || this.selectedPhone || this.modal || this.loading)
            return;
        this.refreshIn -= 1;
        if (this.refreshIn <= 0) {
            void this.loadSessions().catch(() => undefined);
            return;
        }
        const label = this.root.querySelector('[data-refresh-countdown]');
        if (label)
            label.textContent = `${this.refreshIn}s`;
    }
    openSession(phone) {
        if (!this.findSession(phone))
            return;
        this.selectedPhone = phone;
        this.tab = 'overview';
        this.contacts = emptyContactState();
        this.groups = [];
        this.sectionError = '';
        this.render();
    }
    async openSessionTab(tab) {
        this.tab = tab;
        this.sectionError = '';
        this.render();
        if (tab === 'contacts' && !this.contacts.items.length)
            await this.loadContacts(true);
        if (tab === 'groups' && !this.groups.length)
            await this.loadGroups();
    }
    async loadContacts(reset) {
        if (!this.selectedPhone || this.loadingSection)
            return;
        if (reset)
            this.contacts = emptyContactState();
        this.loadingSection = true;
        this.sectionError = '';
        this.render();
        try {
            const page = await this.api.contacts(this.selectedPhone, reset ? '0' : this.contacts.cursor);
            const byId = new Map(this.contacts.items.map((contact) => [contact.user_id, contact]));
            page.contacts.forEach((contact) => byId.set(contact.user_id, contact));
            this.contacts = {
                items: [...byId.values()],
                cursor: page.next_cursor,
                hasMore: page.has_more,
            };
        }
        catch (error) {
            this.sectionError = this.messageFor(error);
        }
        finally {
            this.loadingSection = false;
            this.render();
        }
    }
    async loadGroups() {
        if (!this.selectedPhone || this.loadingSection)
            return;
        this.loadingSection = true;
        this.sectionError = '';
        this.render();
        try {
            const page = await this.api.groups(this.selectedPhone);
            this.groups = Array.isArray(page.groups) ? page.groups : [];
        }
        catch (error) {
            this.sectionError = this.messageFor(error);
        }
        finally {
            this.loadingSection = false;
            this.render();
        }
    }
    async createSession(data) {
        const phone = digitsOnly(data.get('phone'));
        if (!phone) {
            this.showToast('Informe um telefone válido.');
            return;
        }
        const pending = {
            phone,
            id: phone,
            label: `${data.get('label') || phone}`,
            status: 'connecting',
            provider: 'zapo',
            connectionType: `${data.get('connectionType') || 'qrcode'}`,
            server: 'server_1',
            webhooks: [],
        };
        this.sessions = [...this.sessions.filter((session) => sessionPhone(session) !== phone), pending];
        this.modal = { type: 'connection', phone };
        this.connectionEvent = undefined;
        this.connectionLoading = true;
        this.watchConnection(phone);
        this.render();
        try {
            const created = await this.api.register(phone, {
                provider: 'zapo',
                label: pending.label,
                connectionType: pending.connectionType,
            });
            this.replaceSession(phone, { ...pending, ...created, phone });
            await this.loadSessions();
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        finally {
            this.connectionLoading = false;
            this.render();
        }
    }
    async saveSessionConfig(data) {
        if (!this.selectedPhone)
            return;
        try {
            const updated = await this.api.register(this.selectedPhone, sessionConfigPayload(data));
            this.replaceSession(this.selectedPhone, { ...this.findSession(this.selectedPhone), ...updated });
            this.showToast('Configuração salva.');
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        this.render();
    }
    async saveWebhook(data, index) {
        const session = this.findSession(this.selectedPhone);
        if (!session)
            return;
        const webhooks = [...(session.webhooks || [])];
        const webhook = webhookPayload(data);
        if (index >= 0)
            webhooks[index] = webhook;
        else
            webhooks.push(webhook);
        try {
            const updated = await this.api.saveWebhooks(this.selectedPhone, webhooks);
            this.replaceSession(this.selectedPhone, { ...session, ...updated, webhooks });
            this.modal = undefined;
            this.showToast('Webhook salvo.');
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        this.render();
    }
    async deleteWebhook(index) {
        const session = this.findSession(this.selectedPhone);
        if (!session || index < 0)
            return;
        if (!window.confirm('Remover este webhook da sessão?'))
            return;
        const webhooks = (session.webhooks || []).filter((_, current) => current !== index);
        try {
            const updated = await this.api.saveWebhooks(this.selectedPhone, webhooks);
            this.replaceSession(this.selectedPhone, { ...session, ...updated, webhooks });
            this.modal = undefined;
            this.showToast('Webhook removido.');
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        this.render();
    }
    async sendTestMessage(data) {
        const phone = `${data.get('phone') || ''}`;
        const to = digitsOnly(data.get('to'));
        const body = `${data.get('body') || ''}`.trim();
        try {
            await this.api.sendText(phone, to, body);
            this.modal = undefined;
            this.showToast('Mensagem enviada para processamento.');
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        this.render();
    }
    async deregister(phone) {
        try {
            await this.api.deregister(phone);
            this.modal = undefined;
            this.selectedPhone = '';
            this.showToast('Sessão desconectada. Um novo pareamento será necessário.');
            await this.loadSessions();
        }
        catch (error) {
            this.showToast(this.messageFor(error));
            this.render();
        }
    }
    async openConnection(phone) {
        const session = this.findSession(phone);
        if (!session)
            return;
        this.modal = { type: 'connection', phone };
        this.connectionEvent = undefined;
        this.connectionLoading = true;
        this.watchConnection(phone);
        this.render();
        try {
            const latest = await this.api.session(phone);
            this.replaceSession(phone, { ...session, ...latest, phone });
            if (['offline', 'disconnected'].includes(`${latest.status || ''}`.toLowerCase())) {
                await this.api.register(phone);
            }
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        finally {
            this.connectionLoading = false;
            this.render();
        }
    }
    async requestConnection(phone) {
        this.connectionLoading = true;
        this.connectionEvent = undefined;
        this.watchConnection(phone);
        this.render();
        try {
            await this.api.register(phone);
        }
        catch (error) {
            this.showToast(this.messageFor(error));
        }
        finally {
            this.connectionLoading = false;
            this.render();
        }
    }
    watchConnection(phone) {
        this.socket.subscribe(phone, (event) => {
            this.connectionEvent = event;
            if (event.type === 'status' && /connected|online session/i.test(`${event.content || ''}`)) {
                const current = this.findSession(phone);
                if (current)
                    this.replaceSession(phone, { ...current, status: 'online' });
            }
            this.render();
        });
    }
    closeModal() {
        if (this.modal?.type === 'connection')
            this.socket.clear();
        this.modal = undefined;
        this.connectionEvent = undefined;
        this.connectionLoading = false;
        this.render();
    }
    render() {
        if (!this.api.getToken()) {
            this.root.innerHTML = renderLogin(escapeHtml(this.loginError));
            return;
        }
        const selected = this.findSession(this.selectedPhone);
        const content = selected
            ? renderSessionPage({
                session: selected,
                tab: this.tab,
                contacts: this.contacts.items,
                contactsHasMore: this.contacts.hasMore,
                groups: this.groups,
                loadingSection: this.loadingSection,
                sectionError: this.sectionError,
            })
            : renderDashboard({
                sessions: this.sessions,
                query: this.query,
                status: this.statusFilter,
                loading: this.loading,
                refreshIn: this.refreshIn,
            });
        this.root.innerHTML = renderLayout({
            content,
            collapsed: this.collapsed,
            mobileOpen: this.mobileOpen,
        }) + this.renderModal() + (this.toast ? `<div class="toast" role="status">${escapeHtml(this.toast)}</div>` : '');
    }
    renderModal() {
        if (!this.modal)
            return '';
        if (this.modal.type === 'new-session')
            return renderNewSessionModal();
        const session = this.findSession(this.modal.phone);
        if (!session)
            return '';
        if (this.modal.type === 'connection') {
            return renderConnectionModal(session, this.connectionEvent, this.connectionLoading);
        }
        if (this.modal.type === 'message')
            return renderMessageModal(session);
        if (this.modal.type === 'deregister')
            return renderConfirmDeregisterModal(session);
        const webhooks = session.webhooks || [];
        const webhook = this.modal.index >= 0
            ? webhooks[this.modal.index] || { id: 'default' }
            : { id: webhooks.length ? `webhook-${webhooks.length + 1}` : 'default', enabled: true };
        return renderWebhookModal(webhook, this.modal.index);
    }
    findSession(phone) {
        return this.sessions.find((session) => sessionPhone(session) === phone);
    }
    replaceSession(phone, session) {
        const index = this.sessions.findIndex((item) => sessionPhone(item) === phone);
        if (index < 0)
            this.sessions.push(session);
        else
            this.sessions[index] = session;
    }
    showToast(message) {
        this.toast = message;
        window.setTimeout(() => {
            if (this.toast === message) {
                this.toast = '';
                this.render();
            }
        }, 4000);
    }
    startRefreshTimer() {
        if (this.refreshTimer)
            return;
        this.refreshTimer = window.setInterval(() => this.tickRefresh(), 1000);
    }
    messageFor(error) {
        if (error instanceof ApiError) {
            if (error.message === 'contact_directory_requires_zapo_provider') {
                return 'O diretório de contatos está disponível apenas para sessões Zapo.';
            }
            return error.message;
        }
        return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
    }
    applySavedTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = theme;
    }
    toggleTheme() {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem(THEME_KEY, next);
    }
}
