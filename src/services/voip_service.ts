import { VOIP_SERVICE_TOKEN, VOIP_SERVICE_URL } from '../defaults'

export class VoipServiceError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message)
    this.name = 'VoipServiceError'
  }
}

export class VoipService {
  constructor(
    private readonly baseUrl = VOIP_SERVICE_URL,
    private readonly token = VOIP_SERVICE_TOKEN,
    private readonly timeoutMs = Number(process.env.VOIP_SERVICE_TIMEOUT_MS || 10_000),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  available() {
    return !!this.baseUrl.trim() && !!this.token.trim()
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.available()) throw new VoipServiceError(503, 'voip_service_not_configured')
    if (!path.startsWith('/v1/')) throw new VoipServiceError(400, 'invalid_voip_service_path')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, this.timeoutMs))
    timer.unref?.()
    try {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${this.token}`)
      if (init.body) headers.set('Content-Type', 'application/json')
      const response = await this.fetcher(new URL(path, this.baseUrl).toString(), { ...init, headers, signal: controller.signal })
      const text = await response.text()
      let payload: unknown
      try {
        payload = text ? JSON.parse(text) : undefined
      } catch {
        payload = text
      }
      if (!response.ok) {
        const message =
          payload && typeof payload === 'object'
            ? `${(payload as any).message || (payload as any).error || 'voip_service_error'}`
            : 'voip_service_error'
        throw new VoipServiceError(response.status, message, payload)
      }
      return payload as T
    } catch (error) {
      if (error instanceof VoipServiceError) throw error
      if ((error as any)?.name === 'AbortError') throw new VoipServiceError(504, 'voip_service_timeout')
      throw new VoipServiceError(502, 'voip_service_unavailable')
    } finally {
      clearTimeout(timer)
    }
  }

  async stream(path: string): Promise<Response> {
    if (!this.available()) throw new VoipServiceError(503, 'voip_service_not_configured')
    if (!path.startsWith('/v1/')) throw new VoipServiceError(400, 'invalid_voip_service_path')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, this.timeoutMs))
    timer.unref?.()
    try {
      const response = await this.fetcher(new URL(path, this.baseUrl).toString(), {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        const text = await response.text()
        let payload: unknown = text
        try { payload = text ? JSON.parse(text) : undefined } catch {}
        const message = payload && typeof payload === 'object'
          ? `${(payload as any).message || (payload as any).error || 'voip_service_error'}`
          : 'voip_service_error'
        throw new VoipServiceError(response.status, message, payload)
      }
      return response
    } catch (error) {
      if (error instanceof VoipServiceError) throw error
      if ((error as any)?.name === 'AbortError') throw new VoipServiceError(504, 'voip_service_timeout')
      throw new VoipServiceError(502, 'voip_service_unavailable')
    } finally {
      clearTimeout(timer)
    }
  }

  async bootstrap() {
    const [consoleState, bridges, calls, history, recordingSummary] = await Promise.all([
      this.request<any>('/v1/console/bootstrap'),
      this.request<any>('/v1/zapo/bridges'),
      this.request<any>('/v1/zapo/calls'),
      this.request<any>('/v1/console/history?limit=20'),
      this.request<any>('/v1/console/recording/summary'),
    ])
    return { ...consoleState, ...(consoleState.config || {}), ...bridges, ...calls, history, recordingSummary }
  }
}
