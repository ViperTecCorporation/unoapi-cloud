import { t } from './i18n.js?v=4.0.0-beta8-06f3a62c';
export class ApiError extends Error {
    constructor(status, message, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
        this.name = 'ApiError';
    }
}
const errorMessage = (payload, status) => {
    if (payload && typeof payload === 'object') {
        const value = payload;
        const message = value.message || value.error || value.title;
        if (message)
            return `${message}`;
    }
    return t('Falha HTTP {status}', { status });
};
export class ApiClient {
    constructor(baseUrl, fetcher = fetch) {
        this.baseUrl = baseUrl;
        this.fetcher = fetcher;
        this.token = '';
    }
    setToken(token) {
        this.token = token.trim();
    }
    getToken() {
        return this.token;
    }
    async request(path, init = {}) {
        const headers = new Headers(init.headers);
        if (this.token)
            headers.set('Authorization', `Bearer ${this.token}`);
        if (init.body && !headers.has('Content-Type'))
            headers.set('Content-Type', 'application/json');
        const response = await this.fetcher.call(globalThis, `${this.baseUrl}${path}`, { ...init, headers });
        if (response.status === 204)
            return undefined;
        const text = await response.text();
        let payload = undefined;
        if (text) {
            try {
                payload = JSON.parse(text);
            }
            catch {
                payload = text;
            }
        }
        if (!response.ok)
            throw new ApiError(response.status, errorMessage(payload, response.status), payload);
        return payload;
    }
    async sessions() {
        const response = await this.request('/sessions');
        return Array.isArray(response?.data) ? response.data : [];
    }
    versionStatus() {
        return this.request('/version');
    }
    session(phone) {
        return this.request(`/v15.0/${encodeURIComponent(phone)}`);
    }
    register(phone, config = {}) {
        return this.request(`/v15.0/${encodeURIComponent(phone)}/register`, {
            method: 'POST',
            body: JSON.stringify(config),
        });
    }
    deregister(phone) {
        return this.request(`/v15.0/${encodeURIComponent(phone)}/deregister`, {
            method: 'POST',
        });
    }
    contacts(phone, cursor = '0', limit = 20, search = '') {
        const query = new URLSearchParams({ cursor, limit: `${limit}` });
        if (search.trim())
            query.set('search', search.trim());
        return this.request(`/${encodeURIComponent(phone)}/contacts?${query}`);
    }
    groups(phone, cursor = '0', limit = 20, search = '') {
        const query = new URLSearchParams({ cursor, limit: `${limit}` });
        if (search.trim())
            query.set('search', search.trim());
        return this.request(`/v15.0/${encodeURIComponent(phone)}/groups?${query}`);
    }
    saveWebhooks(phone, webhooks) {
        return this.register(phone, {
            webhooks,
            overrideWebhooks: true,
        });
    }
    sendText(phone, to, body) {
        return this.request(`/v15.0/${encodeURIComponent(phone)}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body },
            }),
        });
    }
    async queues() {
        const response = await this.request('/admin/rabbitmq/queues');
        return Array.isArray(response?.queues) ? response.queues : [];
    }
    async queueMessages(queue, session = '', limit = 20) {
        const query = new URLSearchParams({ limit: `${limit}` });
        if (session)
            query.set('session', session);
        const response = await this.request(`/admin/rabbitmq/queues/${encodeURIComponent(queue)}/messages?${query}`);
        return Array.isArray(response?.messages) ? response.messages : [];
    }
    purgeQueue(queue, count) {
        return this.request(`/admin/rabbitmq/queues/${encodeURIComponent(queue)}/messages`, {
            method: 'DELETE',
            body: JSON.stringify({ confirm: queue, count }),
        });
    }
    async redisKeys(search = '', limit = 500) {
        const query = new URLSearchParams({ limit: `${limit}` });
        if (search.trim())
            query.set('search', search.trim());
        const response = await this.request(`/admin/redis/keys?${query}`);
        return Array.isArray(response?.keys) ? response.keys : [];
    }
    async redisTree(prefix = '', limit = 100) {
        const query = new URLSearchParams({ limit: `${limit}` });
        if (prefix)
            query.set('prefix', prefix);
        const response = await this.request(`/admin/redis/tree?${query}`);
        return Array.isArray(response?.nodes) ? response.nodes : [];
    }
    deleteRedisPrefix(prefix) {
        const query = new URLSearchParams({ prefix });
        return this.request(`/admin/redis/tree?${query}`, {
            method: 'DELETE',
            body: JSON.stringify({ confirm: prefix }),
        });
    }
    redisKey(key) {
        return this.request(`/admin/redis/keys/${encodeURIComponent(key)}`);
    }
    saveRedisKey(key, type, value, ttlSeconds) {
        return this.request(`/admin/redis/keys/${encodeURIComponent(key)}`, {
            method: 'PUT',
            body: JSON.stringify({ confirm: key, type, value, ttlSeconds }),
        });
    }
    deleteRedisKey(key) {
        return this.request(`/admin/redis/keys/${encodeURIComponent(key)}`, {
            method: 'DELETE',
            body: JSON.stringify({ confirm: key }),
        });
    }
    async redisQuery(command, args) {
        const response = await this.request('/admin/redis/query', {
            method: 'POST',
            body: JSON.stringify({ command, args }),
        });
        return response?.result;
    }
}
