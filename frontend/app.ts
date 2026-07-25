import { ApiClient, ApiError } from './core/api.js'
import { digitsOnly, escapeHtml, messageRecipient } from './core/html.js'
import { getLocale, normalizeLocale, setLocale, t } from './core/i18n.js'
import { SocketBridge } from './core/socket.js'
import { renderLayout, renderLogin } from './components/layout.js'
import { isLegacySession, sessionPhone } from './domain/session.js'
import type { ContactDirectoryItem, GroupSummary, QrBroadcast, RabbitQueueInfo, RabbitQueueMessage, RedisKeyDetails, RedisKeyType, SessionConfig, SessionTab, VersionStatus, WebhookConfig } from './domain/types.js'
import { sessionConfigPayload } from './features/session_config.js'
import { renderConfirmDeregisterModal, renderConnectionModal, renderMessageModal, renderNewSessionModal } from './features/session_modals.js'
import { renderWebhookModal, webhookPayload } from './features/webhooks.js'
import { renderDashboard } from './pages/dashboard.js'
import { renderSessionPage } from './pages/session.js'
import { renderQueuePurgeModal, renderQueuesPage } from './pages/queues.js'
import { renderRedisDeleteModal, renderRedisEditorModal, renderRedisPage } from './pages/redis.js'
import { filterContacts, filterGroups } from './features/entities.js'

const TOKEN_KEY = 'whatsappApiToken'
const THEME_KEY = 'viperconnect_theme'
const SIDEBAR_KEY = 'viperconnect_sidebar_collapsed'
const LOCALE_KEY = 'viperconnect_locale'
const REFRESH_SECONDS = 15
const PAGE_SIZE = 20
const VERSION_REFRESH_MS = 15 * 60 * 1000
const QUEUE_REFRESH_SECONDS = 30

type ModalState =
  | { type: 'new-session' }
  | { type: 'connection'; phone: string }
  | { type: 'message'; phone: string; recipient?: string }
  | { type: 'webhook'; phone: string; index: number }
  | { type: 'deregister'; phone: string }
  | { type: 'queue-purge'; queue: string }
  | { type: 'redis-editor' }
  | { type: 'redis-delete'; key: string }

const emptyContactState = () => ({
  items: [] as ContactDirectoryItem[],
  cursor: '0',
  hasMore: false,
  totalCount: 0,
})

const emptyVersionStatus = (): VersionStatus => ({
  installed_version: '',
  update_available: false,
  status: 'unknown',
  checked_at: '',
})

export class ViperConnectApp {
  private readonly api: ApiClient
  private readonly socket: SocketBridge
  private sessions: SessionConfig[] = []
  private selectedPhone = ''
  private tab: SessionTab = 'overview'
  private query = ''
  private statusFilter = 'all'
  private contacts = emptyContactState()
  private contactsQuery = ''
  private contactsVisibleLimit = PAGE_SIZE
  private groups: GroupSummary[] = []
  private groupsCursor = '0'
  private groupsHasMore = false
  private groupsQuery = ''
  private sessionVisibleLimit = PAGE_SIZE
  private view: 'dashboard' | 'queues' | 'redis' = 'dashboard'
  private queues: RabbitQueueInfo[] = []
  private queueMessages: RabbitQueueMessage[] = []
  private selectedQueue = ''
  private queueQuery = ''
  private queueSession = ''
  private queueVisibleLimit = PAGE_SIZE
  private queueRefreshIn = QUEUE_REFRESH_SECONDS
  private queuesLoading = false
  private queueMessagesLoading = false
  private queueError = ''
  private redisKeys: string[] = []
  private selectedRedisKey?: RedisKeyDetails
  private redisQuery = ''
  private redisSession = ''
  private redisQueryResult: unknown = undefined
  private redisLoading = false
  private redisRefreshIn = QUEUE_REFRESH_SECONDS
  private redisError = ''
  private loading = false
  private loadingSection = false
  private sectionError = ''
  private loginError = ''
  private refreshIn = REFRESH_SECONDS
  private modal?: ModalState
  private connectionEvent?: QrBroadcast
  private connectionLoading = false
  private collapsed = localStorage.getItem(SIDEBAR_KEY) === 'true'
  private mobileOpen = false
  private toast = ''
  private versionStatus = emptyVersionStatus()
  private refreshTimer?: number
  private versionTimer?: number
  private groupSearchTimer?: number
  private contactSearchTimer?: number

  constructor(
    private readonly root: HTMLElement,
    baseUrl = window.location.origin,
    api = new ApiClient(baseUrl),
    socket = new SocketBridge(baseUrl),
  ) {
    this.api = api
    this.socket = socket
    setLocale(normalizeLocale(localStorage.getItem(LOCALE_KEY) || navigator.language))
    document.documentElement.lang = getLocale()
    this.bindEvents()
  }

  async start(): Promise<void> {
    this.applySavedTheme()
    const token = localStorage.getItem(TOKEN_KEY) || ''
    if (!token) {
      this.render()
      return
    }
    this.api.setToken(token)
    try {
      await this.loadSessions(true)
      this.startRefreshTimer()
      this.startVersionTimer()
    } catch {}
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      void this.handleClick(event)
    })
    this.root.addEventListener('submit', (event) => {
      void this.handleSubmit(event)
    })
    this.root.addEventListener('input', (event) => this.handleFilter(event))
    this.root.addEventListener('change', (event) => this.handleFilter(event))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.modal) this.closeModal()
    })
  }

  private async handleClick(event: Event): Promise<void> {
    const target = event.target as HTMLElement
    const actionElement = target.closest<HTMLElement>('[data-action]')
    const closeModal = target.closest<HTMLElement>('[data-close-modal]')
    const backdrop = target.matches('[data-modal-backdrop]')

    if (closeModal || backdrop) {
      this.closeModal()
      return
    }
    if (!actionElement) return

    const action = actionElement.dataset.action || ''
    const phone = actionElement.dataset.phone || ''
    if (action === 'toggle-sidebar') {
      this.collapsed = !this.collapsed
      localStorage.setItem(SIDEBAR_KEY, `${this.collapsed}`)
      this.render()
    } else if (action === 'toggle-mobile-menu') {
      this.mobileOpen = !this.mobileOpen
      this.render()
    } else if (action === 'toggle-theme') {
      this.toggleTheme()
    } else if (action === 'toggle-language') {
      this.toggleLanguage()
    } else if (action === 'logout') {
      this.logout()
    } else if (action === 'go-dashboard') {
      this.selectedPhone = ''
      this.view = 'dashboard'
      this.tab = 'overview'
      this.mobileOpen = false
      this.render()
    } else if (action === 'open-queues') {
      this.selectedPhone = ''
      this.view = 'queues'
      this.mobileOpen = false
      this.render()
      await this.loadQueues()
    } else if (action === 'open-redis') {
      this.selectedPhone = ''
      this.view = 'redis'
      this.mobileOpen = false
      this.render()
      await this.loadRedisKeys()
    } else if (action === 'refresh-queues') {
      await this.loadQueues()
    } else if (action === 'load-more-queues') {
      this.queueVisibleLimit += PAGE_SIZE
      this.render()
    } else if (action === 'inspect-queue') {
      await this.inspectQueue(actionElement.dataset.queue || '')
    } else if (action === 'open-queue-purge') {
      this.modal = { type: 'queue-purge', queue: actionElement.dataset.queue || '' }
      this.render()
    } else if (action === 'refresh-redis') {
      await this.loadRedisKeys()
    } else if (action === 'select-redis-key') {
      await this.loadRedisKey(actionElement.dataset.key || '')
    } else if (action === 'add-redis-key') {
      this.selectedRedisKey = undefined
      this.modal = { type: 'redis-editor' }
      this.render()
    } else if (action === 'edit-redis-key') {
      if (this.selectedRedisKey) {
        this.modal = { type: 'redis-editor' }
        this.render()
      }
    } else if (action === 'delete-redis-key') {
      if (this.selectedRedisKey) {
        this.modal = { type: 'redis-delete', key: this.selectedRedisKey.key }
        this.render()
      }
    } else if (action === 'refresh') {
      await this.loadSessions().catch(() => undefined)
    } else if (action === 'load-more-sessions') {
      this.sessionVisibleLimit += PAGE_SIZE
      this.render()
    } else if (action === 'new-session') {
      this.modal = { type: 'new-session' }
      this.render()
    } else if (action === 'manage-session') {
      await this.openSession(phone)
    } else if (action === 'session-tab') {
      await this.openSessionTab(actionElement.dataset.tab as SessionTab)
    } else if (action === 'connect-session') {
      await this.openConnection(phone)
    } else if (action === 'request-connection') {
      await this.requestConnection(phone)
    } else if (action === 'test-message') {
      this.modal = { type: 'message', phone, recipient: actionElement.dataset.recipient }
      this.render()
    } else if (action === 'deregister-session') {
      this.modal = { type: 'deregister', phone }
      this.render()
    } else if (action === 'confirm-deregister') {
      await this.deregister(phone)
    } else if (action === 'reload-contacts') {
      await this.loadContacts(true)
    } else if (action === 'load-more-contacts') {
      const target = this.contactsVisibleLimit + PAGE_SIZE
      while (
        filterContacts(this.contacts.items, this.contactsQuery).length < target
        && this.contacts.hasMore
      ) {
        const previousCursor = this.contacts.cursor
        const previousCount = this.contacts.items.length
        await this.loadContacts(false)
        if (
          this.contacts.cursor === previousCursor
          && this.contacts.items.length === previousCount
        ) break
      }
      this.contactsVisibleLimit = target
      this.render()
    } else if (action === 'reload-groups') {
      await this.loadGroups(true)
    } else if (action === 'load-more-groups') {
      await this.loadGroups(false)
    } else if (action === 'new-webhook') {
      this.modal = { type: 'webhook', phone: this.selectedPhone, index: -1 }
      this.render()
    } else if (action === 'edit-webhook') {
      this.modal = {
        type: 'webhook',
        phone: this.selectedPhone,
        index: Number(actionElement.dataset.webhookIndex),
      }
      this.render()
    } else if (action === 'delete-webhook') {
      await this.deleteWebhook(Number(actionElement.dataset.webhookIndex))
    } else if (action === 'toggle-tooltip') {
      this.toggleTooltip(actionElement)
    } else if (action === 'toggle-secret') {
      this.toggleSecret(actionElement)
    } else if (action === 'copy-secret') {
      await this.copySecret(actionElement)
    } else if (action === 'copy-value') {
      await this.copyValue(actionElement)
    }
  }

  private async handleSubmit(event: Event): Promise<void> {
    const form = event.target as HTMLFormElement
    if (!(form instanceof HTMLFormElement) || !form.dataset.form) return
    event.preventDefault()
    const data = new FormData(form)

    if (form.dataset.form === 'login') {
      await this.login(`${data.get('token') || ''}`)
    } else if (form.dataset.form === 'new-session') {
      await this.createSession(data)
    } else if (form.dataset.form === 'session-config') {
      await this.saveSessionConfig(data)
    } else if (form.dataset.form === 'webhook') {
      await this.saveWebhook(data, Number(form.dataset.webhookIndex))
    } else if (form.dataset.form === 'test-message') {
      await this.sendTestMessage(data)
    } else if (form.dataset.form === 'queue-purge') {
      await this.purgeQueue(data)
    } else if (form.dataset.form === 'redis-save') {
      await this.saveRedisKey(data)
    } else if (form.dataset.form === 'redis-delete') {
      await this.deleteRedisKey(data)
    } else if (form.dataset.form === 'redis-query') {
      await this.runRedisQuery(data)
    }
  }

  private handleFilter(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLSelectElement
    if (input.dataset.filter === 'query') {
      this.query = input.value
      this.sessionVisibleLimit = PAGE_SIZE
      this.render()
      const next = this.root.querySelector<HTMLInputElement>('[data-filter="query"]')
      next?.focus()
      next?.setSelectionRange(next.value.length, next.value.length)
    } else if (input.dataset.filter === 'status') {
      this.statusFilter = input.value
      this.sessionVisibleLimit = PAGE_SIZE
      this.render()
    } else if (input.dataset.filter === 'contacts-query') {
      this.contactsQuery = input.value
      this.renderAndRestoreFilter('contacts-query')
      if (this.contactSearchTimer) window.clearTimeout(this.contactSearchTimer)
      this.contactSearchTimer = window.setTimeout(() => {
        void this.loadContacts(true)
      }, 300)
    } else if (input.dataset.filter === 'groups-query') {
      this.groupsQuery = input.value
      this.renderAndRestoreFilter('groups-query')
      if (this.groupSearchTimer) window.clearTimeout(this.groupSearchTimer)
      this.groupSearchTimer = window.setTimeout(() => {
        void this.loadGroups(true)
      }, 300)
    } else if (input.dataset.filter === 'queues-query') {
      this.queueQuery = input.value
      this.queueVisibleLimit = PAGE_SIZE
      this.renderAndRestoreFilter('queues-query')
    } else if (input.dataset.filter === 'queues-session') {
      this.queueSession = input.value
      this.queueVisibleLimit = PAGE_SIZE
      this.queueMessages = []
      if (this.selectedQueue) void this.inspectQueue(this.selectedQueue)
      else this.render()
    } else if (input.dataset.filter === 'redis-query') {
      this.redisQuery = input.value
      this.renderAndRestoreFilter('redis-query')
    } else if (input.dataset.filter === 'redis-session') {
      this.redisSession = input.value
      this.render()
    }
  }

  private async login(token: string): Promise<void> {
    this.api.setToken(token)
    this.loginError = ''
    try {
      await this.loadSessions(true)
      localStorage.setItem(TOKEN_KEY, token.trim())
      this.startRefreshTimer()
      this.startVersionTimer()
    } catch (error) {
      this.api.setToken('')
      this.loginError = this.messageFor(error)
      this.render()
    }
  }

  private logout(): void {
    localStorage.removeItem(TOKEN_KEY)
    this.api.setToken('')
    this.sessions = []
    this.selectedPhone = ''
    this.view = 'dashboard'
    this.modal = undefined
    this.socket.clear()
    if (this.versionTimer) window.clearInterval(this.versionTimer)
    this.versionTimer = undefined
    this.versionStatus = emptyVersionStatus()
    this.render()
  }

  private async loadSessions(initial = false): Promise<void> {
    if (this.loading) return
    this.loading = true
    if (!initial) this.render()
    try {
      this.sessions = await this.api.sessions()
      this.refreshIn = REFRESH_SECONDS
      this.loginError = ''
      if (this.selectedPhone) {
        const selected = this.findSession(this.selectedPhone)
        if (!selected) this.selectedPhone = ''
      }
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        localStorage.removeItem(TOKEN_KEY)
        this.api.setToken('')
        this.loginError = t('Token inválido ou sem permissão.')
      } else {
        this.showToast(this.messageFor(error))
      }
      throw error
    } finally {
      this.loading = false
      this.render()
    }
  }

  private tickRefresh(): void {
    if (!this.api.getToken() || this.modal) return
    if (this.view === 'queues') {
      if (this.queuesLoading || this.queueMessagesLoading) return
      this.queueRefreshIn -= 1
      if (this.queueRefreshIn <= 0) {
        void this.loadQueues().catch(() => undefined)
        return
      }
      const label = this.root.querySelector<HTMLElement>('[data-refresh-countdown]')
      if (label) label.textContent = `${this.queueRefreshIn}s`
      return
    }
    if (this.view === 'redis') {
      if (this.redisLoading) return
      this.redisRefreshIn -= 1
      if (this.redisRefreshIn <= 0) {
        void this.loadRedisKeys().catch(() => undefined)
        return
      }
      const label = this.root.querySelector<HTMLElement>('[data-refresh-countdown]')
      if (label) label.textContent = `${this.redisRefreshIn}s`
      return
    }
    if (this.selectedPhone || this.loading) return
    this.refreshIn -= 1
    if (this.refreshIn <= 0) {
      void this.loadSessions().catch(() => undefined)
      return
    }
    const label = this.root.querySelector<HTMLElement>('[data-refresh-countdown]')
    if (label) label.textContent = `${this.refreshIn}s`
  }

  private async openSession(phone: string): Promise<void> {
    const session = this.findSession(phone)
    if (!session) return
    this.selectedPhone = phone
    this.view = 'dashboard'
    this.tab = 'overview'
    this.contacts = emptyContactState()
    this.contactsQuery = ''
    this.contactsVisibleLimit = PAGE_SIZE
    this.groups = []
    this.groupsCursor = '0'
    this.groupsHasMore = false
    this.groupsQuery = ''
    this.sectionError = ''
    this.render()
    if (!isLegacySession(session)) await this.loadContacts(true)
  }

  private async openSessionTab(tab: SessionTab): Promise<void> {
    this.tab = tab
    this.sectionError = ''
    this.render()
    if (tab === 'contacts' && !this.contacts.items.length) await this.loadContacts(true)
    if (tab === 'groups' && !this.groups.length) await this.loadGroups(true)
  }

  private async loadContacts(reset: boolean): Promise<void> {
    if (!this.selectedPhone || this.loadingSection) return
    if (reset) {
      this.contacts = emptyContactState()
      this.contactsVisibleLimit = PAGE_SIZE
    }
    this.loadingSection = true
    this.sectionError = ''
    this.render()
    try {
      const page = await this.api.contacts(this.selectedPhone, reset ? '0' : this.contacts.cursor, PAGE_SIZE, this.contactsQuery)
      const byId = new Map(this.contacts.items.map((contact) => [contact.user_id, contact]))
      page.contacts.forEach((contact) => byId.set(contact.user_id, contact))
      this.contacts = {
        items: [...byId.values()],
        cursor: page.next_cursor,
        hasMore: page.has_more,
        totalCount: page.total_count,
      }
    } catch (error) {
      this.sectionError = this.messageFor(error)
    } finally {
      this.loadingSection = false
      this.render()
    }
  }

  private async loadGroups(reset: boolean): Promise<void> {
    if (!this.selectedPhone || this.loadingSection) return
    if (reset) {
      this.groups = []
      this.groupsCursor = '0'
      this.groupsHasMore = false
    }
    this.loadingSection = true
    this.sectionError = ''
    this.render()
    try {
      const page = await this.api.groups(this.selectedPhone, reset ? '0' : this.groupsCursor, PAGE_SIZE, this.groupsQuery)
      const byId = new Map(this.groups.map((group) => [group.id || group.jid || '', group]))
      page.groups.forEach((group) => byId.set(group.id || group.jid || '', group))
      this.groups = [...byId.values()]
      this.groupsCursor = `${page.paging?.cursors?.after || '0'}`
      this.groupsHasMore = page.paging?.has_more === true || this.groupsCursor !== '0'
    } catch (error) {
      this.sectionError = this.messageFor(error)
    } finally {
      this.loadingSection = false
      this.render()
    }
  }

  private async createSession(data: FormData): Promise<void> {
    const phone = digitsOnly(data.get('phone'))
    if (!phone) {
      this.showToast(t('Informe um telefone válido.'))
      return
    }
    const pending: SessionConfig = {
      phone,
      id: phone,
      label: `${data.get('label') || phone}`,
      status: 'connecting',
      provider: 'zapo',
      connectionType: `${data.get('connectionType') || 'qrcode'}` as SessionConfig['connectionType'],
      server: 'server_1',
      webhooks: [],
    }
    this.sessions = [...this.sessions.filter((session) => sessionPhone(session) !== phone), pending]
    this.modal = { type: 'connection', phone }
    this.connectionEvent = undefined
    this.connectionLoading = true
    this.watchConnection(phone)
    this.render()
    try {
      const created = await this.api.register(phone, {
        provider: 'zapo',
        label: pending.label,
        connectionType: pending.connectionType,
      })
      this.replaceSession(phone, { ...pending, ...created, phone })
      await this.loadSessions()
    } catch (error) {
      this.showToast(this.messageFor(error))
    } finally {
      this.connectionLoading = false
      this.render()
    }
  }

  private async saveSessionConfig(data: FormData): Promise<void> {
    if (!this.selectedPhone) return
    try {
      const updated = await this.api.register(this.selectedPhone, sessionConfigPayload(data))
      this.replaceSession(this.selectedPhone, { ...this.findSession(this.selectedPhone), ...updated })
      this.showToast(t('Configuração salva.'))
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
    this.render()
  }

  private async saveWebhook(data: FormData, index: number): Promise<void> {
    const session = this.findSession(this.selectedPhone)
    if (!session) return
    const webhooks = [...(session.webhooks || [])]
    const webhook = webhookPayload(data)
    if (index >= 0) webhooks[index] = webhook
    else webhooks.push(webhook)
    try {
      const updated = await this.api.saveWebhooks(this.selectedPhone, webhooks)
      this.replaceSession(this.selectedPhone, { ...session, ...updated, webhooks })
      this.modal = undefined
      this.showToast(t('Webhook salvo.'))
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
    this.render()
  }

  private async deleteWebhook(index: number): Promise<void> {
    const session = this.findSession(this.selectedPhone)
    if (!session || index < 0) return
    if (!window.confirm(t('Remover este webhook da sessão?'))) return
    const webhooks = (session.webhooks || []).filter((_, current) => current !== index)
    try {
      const updated = await this.api.saveWebhooks(this.selectedPhone, webhooks)
      this.replaceSession(this.selectedPhone, { ...session, ...updated, webhooks })
      this.modal = undefined
      this.showToast(t('Webhook removido.'))
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
    this.render()
  }

  private async sendTestMessage(data: FormData): Promise<void> {
    const phone = `${data.get('phone') || ''}`
    const to = messageRecipient(data.get('to'))
    const body = `${data.get('body') || ''}`.trim()
    try {
      await this.api.sendText(phone, to, body)
      this.modal = undefined
      this.showToast(t('Mensagem enviada para processamento.'))
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
    this.render()
  }

  private async deregister(phone: string): Promise<void> {
    try {
      await this.api.deregister(phone)
      this.modal = undefined
      this.selectedPhone = ''
      this.showToast(t('Sessão desconectada. Um novo pareamento será necessário.'))
      await this.loadSessions()
    } catch (error) {
      this.showToast(this.messageFor(error))
      this.render()
    }
  }

  private async loadQueues(): Promise<void> {
    if (this.queuesLoading) return
    this.queuesLoading = true
    this.queueError = ''
    this.render()
    try {
      this.queues = await this.api.queues()
      this.queueRefreshIn = QUEUE_REFRESH_SECONDS
      if (this.selectedQueue && !this.queues.some((queue) => queue.name === this.selectedQueue)) {
        this.selectedQueue = ''
        this.queueMessages = []
      }
    } catch (error) {
      this.queueError = this.messageFor(error)
    } finally {
      this.queuesLoading = false
      this.render()
    }
  }

  private async inspectQueue(queue: string): Promise<void> {
    if (!queue || this.queueMessagesLoading) return
    this.selectedQueue = queue
    this.queueMessagesLoading = true
    this.queueError = ''
    this.render()
    try {
      this.queueMessages = await this.api.queueMessages(queue, this.queueSession)
    } catch (error) {
      this.queueError = this.messageFor(error)
      this.queueMessages = []
    } finally {
      this.queueMessagesLoading = false
      this.render()
    }
  }

  private async purgeQueue(data: FormData): Promise<void> {
    const queue = `${data.get('queue') || ''}`
    if (`${data.get('confirm') || ''}` !== queue) {
      this.showToast(t('Nome da fila não confere.'))
      return
    }
    const rawCount = `${data.get('count') || '1'}`
    const count: number | 'all' = rawCount === 'all' ? 'all' : Math.min(50, Math.max(1, Number(rawCount) || 1))
    try {
      const result = await this.api.purgeQueue(queue, count)
      this.modal = undefined
      this.showToast(t('Mensagens removidas: {count}.', {
        count: result.removed === 'all' ? t('Todas as mensagens prontas') : result.removed,
      }))
      await this.loadQueues()
      if (this.selectedQueue === queue) await this.inspectQueue(queue)
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
    this.render()
  }

  private async loadRedisKeys(): Promise<void> {
    if (this.redisLoading) return
    this.redisLoading = true
    this.redisError = ''
    this.render()
    try {
      this.redisKeys = await this.api.redisKeys(this.redisSession || this.redisQuery)
      this.redisRefreshIn = QUEUE_REFRESH_SECONDS
      if (this.selectedRedisKey && !this.redisKeys.includes(this.selectedRedisKey.key)) {
        this.selectedRedisKey = undefined
      }
    } catch (error) {
      this.redisError = this.messageFor(error)
    } finally {
      this.redisLoading = false
      this.render()
    }
  }

  private async loadRedisKey(key: string): Promise<void> {
    if (!key || this.redisLoading) return
    this.redisLoading = true
    this.redisError = ''
    this.render()
    try {
      this.selectedRedisKey = await this.api.redisKey(key)
    } catch (error) {
      this.redisError = this.messageFor(error)
    } finally {
      this.redisLoading = false
      this.render()
    }
  }

  private async saveRedisKey(data: FormData): Promise<void> {
    const key = `${data.get('key') || ''}`.trim()
    if (`${data.get('confirm') || ''}` !== key) {
      this.showToast(t('Nome da chave não confere.'))
      return
    }
    const raw = `${data.get('value') || ''}`
    let value: unknown = raw
    try {
      value = JSON.parse(raw)
    } catch {}
    try {
      await this.api.saveRedisKey(
        key,
        `${data.get('type') || 'string'}` as RedisKeyType,
        value,
        Number(data.get('ttlSeconds') ?? -1),
      )
      this.modal = undefined
      this.showToast(t('Chave salva.'))
      await this.loadRedisKeys()
      await this.loadRedisKey(key)
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
  }

  private async deleteRedisKey(data: FormData): Promise<void> {
    const key = `${data.get('key') || ''}`
    if (`${data.get('confirm') || ''}` !== key) {
      this.showToast(t('Nome da chave não confere.'))
      return
    }
    try {
      await this.api.deleteRedisKey(key)
      this.modal = undefined
      this.selectedRedisKey = undefined
      this.showToast(t('Chave excluída.'))
      await this.loadRedisKeys()
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
  }

  private async runRedisQuery(data: FormData): Promise<void> {
    try {
      this.redisQueryResult = await this.api.redisQuery(
        `${data.get('command') || ''}`,
        [`${data.get('argument') || ''}`],
      )
    } catch (error) {
      this.showToast(this.messageFor(error))
    }
    this.render()
  }

  private async openConnection(phone: string): Promise<void> {
    const session = this.findSession(phone)
    if (!session) return
    this.modal = { type: 'connection', phone }
    this.connectionEvent = undefined
    this.connectionLoading = true
    this.watchConnection(phone)
    this.render()
    try {
      const latest = await this.api.session(phone)
      this.replaceSession(phone, { ...session, ...latest, phone })
      if (['offline', 'disconnected'].includes(`${latest.status || ''}`.toLowerCase())) {
        await this.api.register(phone)
      }
    } catch (error) {
      this.showToast(this.messageFor(error))
    } finally {
      this.connectionLoading = false
      this.render()
    }
  }

  private async requestConnection(phone: string): Promise<void> {
    this.connectionLoading = true
    this.connectionEvent = undefined
    this.watchConnection(phone)
    this.render()
    try {
      await this.api.register(phone)
    } catch (error) {
      this.showToast(this.messageFor(error))
    } finally {
      this.connectionLoading = false
      this.render()
    }
  }

  private watchConnection(phone: string): void {
    this.socket.subscribe(phone, (event) => {
      this.connectionEvent = event
      if (event.type === 'status' && /connected|online session/i.test(`${event.content || ''}`)) {
        const current = this.findSession(phone)
        if (current) this.replaceSession(phone, { ...current, status: 'online' })
      }
      this.render()
    })
  }

  private closeModal(): void {
    if (this.modal?.type === 'connection') this.socket.clear()
    this.modal = undefined
    this.connectionEvent = undefined
    this.connectionLoading = false
    this.render()
  }

  private render(): void {
    if (!this.api.getToken()) {
      this.root.innerHTML = renderLogin(escapeHtml(this.loginError))
      return
    }
    const selected = this.findSession(this.selectedPhone)
    const content = this.view === 'redis'
      ? renderRedisPage({
          keys: this.redisKeys,
          sessions: this.sessions,
          sessionFilter: this.redisSession,
          query: this.redisQuery,
          selected: this.selectedRedisKey,
          queryResult: this.redisQueryResult,
          loading: this.redisLoading,
          refreshIn: this.redisRefreshIn,
          error: this.redisError,
        })
      : this.view === 'queues'
      ? renderQueuesPage({
          queues: this.queues,
          sessions: this.sessions,
          sessionPhoneFilter: this.queueSession,
          query: this.queueQuery,
          loading: this.queuesLoading,
          refreshIn: this.queueRefreshIn,
          visibleLimit: this.queueVisibleLimit,
          selectedQueue: this.selectedQueue,
          messages: this.queueMessages,
          messagesLoading: this.queueMessagesLoading,
          error: this.queueError,
        })
      : selected
      ? renderSessionPage({
          session: selected,
          tab: this.tab,
          contacts: filterContacts(this.contacts.items, this.contactsQuery).slice(0, this.contactsVisibleLimit),
          contactsHasMore: this.contacts.hasMore || filterContacts(this.contacts.items, this.contactsQuery).length > this.contactsVisibleLimit,
          contactCount: this.contacts.totalCount,
          contactsQuery: this.contactsQuery,
          groups: filterGroups(this.groups, this.groupsQuery),
          groupsHasMore: this.groupsHasMore,
          groupsQuery: this.groupsQuery,
          loadingSection: this.loadingSection,
          sectionError: this.sectionError,
        })
      : renderDashboard({
          sessions: this.sessions,
          query: this.query,
          status: this.statusFilter,
          loading: this.loading,
          refreshIn: this.refreshIn,
          visibleLimit: this.sessionVisibleLimit,
        })

    this.root.innerHTML =
      renderLayout({
        content,
        collapsed: this.collapsed,
        mobileOpen: this.mobileOpen,
        versionStatus: this.versionStatus,
        activeView: this.view,
      }) +
      this.renderModal() +
      (this.toast ? `<div class="toast" role="status">${escapeHtml(this.toast)}</div>` : '')
  }

  private renderModal(): string {
    if (!this.modal) return ''
    if (this.modal.type === 'new-session') return renderNewSessionModal()
    if (this.modal.type === 'queue-purge') return renderQueuePurgeModal(this.modal.queue)
    if (this.modal.type === 'redis-editor') return renderRedisEditorModal(this.selectedRedisKey)
    if (this.modal.type === 'redis-delete') return renderRedisDeleteModal(this.modal.key)
    const session = this.findSession(this.modal.phone)
    if (!session) return ''
    if (this.modal.type === 'connection') {
      return renderConnectionModal(session, this.connectionEvent, this.connectionLoading)
    }
    if (this.modal.type === 'message') return renderMessageModal(session, this.modal.recipient)
    if (this.modal.type === 'deregister') return renderConfirmDeregisterModal(session)
    const webhooks = session.webhooks || []
    const webhook: WebhookConfig =
      this.modal.index >= 0
        ? webhooks[this.modal.index] || { id: 'default' }
        : { id: webhooks.length ? `webhook-${webhooks.length + 1}` : 'default', enabled: true }
    return renderWebhookModal(webhook, this.modal.index)
  }

  private findSession(phone: string): SessionConfig | undefined {
    return this.sessions.find((session) => sessionPhone(session) === phone)
  }

  private replaceSession(phone: string, session: SessionConfig): void {
    const index = this.sessions.findIndex((item) => sessionPhone(item) === phone)
    if (index < 0) this.sessions.push(session)
    else this.sessions[index] = session
  }

  private showToast(message: string): void {
    this.toast = message
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = ''
        this.render()
      }
    }, 4_000)
  }

  private renderAndRestoreFilter(filter: string): void {
    this.render()
    const input = this.root.querySelector<HTMLInputElement>(`[data-filter="${filter}"]`)
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }

  private toggleTooltip(button: HTMLElement): void {
    const wasOpen = button.classList.contains('info-tooltip--open')
    this.root.querySelectorAll<HTMLElement>('.info-tooltip--open').forEach((item) => {
      item.classList.remove('info-tooltip--open')
      item.setAttribute('aria-expanded', 'false')
    })
    if (!wasOpen) {
      button.classList.add('info-tooltip--open')
      button.setAttribute('aria-expanded', 'true')
    }
  }

  private toggleSecret(button: HTMLElement): void {
    const input = button.closest('.secret-field')?.querySelector<HTMLInputElement>('input')
    if (!input) return
    const visible = input.type === 'password'
    input.type = visible ? 'text' : 'password'
    button.setAttribute('aria-pressed', `${visible}`)
    button.setAttribute('aria-label', t(visible ? 'Ocultar {label}' : 'Exibir {label}', { label: input.name }))
  }

  private async copySecret(button: HTMLElement): Promise<void> {
    const input = button.closest('.secret-field')?.querySelector<HTMLInputElement>('input')
    if (!input) return
    await this.copyText(input.value)
    this.showToast(t('Valor copiado.'))
  }

  private async copyValue(button: HTMLElement): Promise<void> {
    const value = button.dataset.value || ''
    if (!value) return
    await this.copyText(value)
    this.showToast(t('{label} copiado.', { label: button.dataset.copyLabel || t('Valor') }))
  }

  private async copyText(value: string): Promise<void> {
    try {
      if (!navigator.clipboard) throw new Error('clipboard_unavailable')
      await navigator.clipboard.writeText(value)
    } catch {
      const input = document.createElement('textarea')
      input.value = value
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.append(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
  }

  private startRefreshTimer(): void {
    if (this.refreshTimer) return
    this.refreshTimer = window.setInterval(() => this.tickRefresh(), 1_000)
  }

  private startVersionTimer(): void {
    void this.loadVersionStatus()
    if (this.versionTimer) return
    this.versionTimer = window.setInterval(() => {
      void this.loadVersionStatus()
    }, VERSION_REFRESH_MS)
  }

  private async loadVersionStatus(): Promise<void> {
    if (!this.api.getToken()) return
    try {
      this.versionStatus = await this.api.versionStatus()
    } catch {
      this.versionStatus = {
        ...this.versionStatus,
        status: 'unknown',
        update_available: false,
      }
    }
    this.render()
  }

  private messageFor(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.message === 'contact_directory_requires_zapo_provider') {
        return t('O diretório de contatos está disponível apenas para sessões Zapo.')
      }
      return error.message
    }
    return error instanceof Error ? error.message : t('Ocorreu um erro inesperado.')
  }

  private applySavedTheme(): void {
    const saved = localStorage.getItem(THEME_KEY)
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.dataset.theme = theme
  }

  private toggleTheme(): void {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem(THEME_KEY, next)
  }

  private toggleLanguage(): void {
    const locale = getLocale() === 'pt-BR' ? 'en' : 'pt-BR'
    setLocale(locale)
    localStorage.setItem(LOCALE_KEY, locale)
    document.documentElement.lang = locale
    this.render()
  }
}
