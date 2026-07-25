import type { ContactDirectoryPage, GroupPage, SessionConfig, VersionStatus, WebhookConfig } from '../domain/types.js'
import { t } from './i18n.js'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Fetcher = typeof fetch

const errorMessage = (payload: unknown, status: number): string => {
  if (payload && typeof payload === 'object') {
    const value = payload as Record<string, unknown>
    const message = value.message || value.error || value.title
    if (message) return `${message}`
  }
  return t('Falha HTTP {status}', { status })
}

export class ApiClient {
  private token = ''

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  setToken(token: string): void {
    this.token = token.trim()
  }

  getToken(): string {
    return this.token
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

    // Native browser fetch validates its receiver. Calling it as
    // `this.fetcher()` binds ApiClient as `this` and Chrome rejects the request
    // with "Illegal invocation".
    const response = await this.fetcher.call(globalThis, `${this.baseUrl}${path}`, { ...init, headers })
    if (response.status === 204) return undefined as T

    const text = await response.text()
    let payload: unknown = undefined
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
    if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.status), payload)
    return payload as T
  }

  async sessions(): Promise<SessionConfig[]> {
    const response = await this.request<{ data?: SessionConfig[] }>('/sessions')
    return Array.isArray(response?.data) ? response.data : []
  }

  versionStatus(): Promise<VersionStatus> {
    return this.request<VersionStatus>('/version')
  }

  session(phone: string): Promise<SessionConfig> {
    return this.request<SessionConfig>(`/v15.0/${encodeURIComponent(phone)}`)
  }

  register(phone: string, config: Record<string, unknown> = {}): Promise<SessionConfig> {
    return this.request<SessionConfig>(`/v15.0/${encodeURIComponent(phone)}/register`, {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  deregister(phone: string): Promise<void> {
    return this.request<void>(`/v15.0/${encodeURIComponent(phone)}/deregister`, {
      method: 'POST',
    })
  }

  contacts(phone: string, cursor = '0', limit = 20, search = ''): Promise<ContactDirectoryPage> {
    const query = new URLSearchParams({ cursor, limit: `${limit}` })
    if (search.trim()) query.set('search', search.trim())
    return this.request<ContactDirectoryPage>(`/${encodeURIComponent(phone)}/contacts?${query}`)
  }

  groups(phone: string, cursor = '0', limit = 20, search = ''): Promise<GroupPage> {
    const query = new URLSearchParams({ cursor, limit: `${limit}` })
    if (search.trim()) query.set('search', search.trim())
    return this.request<GroupPage>(`/v15.0/${encodeURIComponent(phone)}/groups?${query}`)
  }

  saveWebhooks(phone: string, webhooks: WebhookConfig[]): Promise<SessionConfig> {
    return this.register(phone, {
      webhooks,
      overrideWebhooks: true,
    })
  }

  sendText(phone: string, to: string, body: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/v15.0/${encodeURIComponent(phone)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    })
  }
}
