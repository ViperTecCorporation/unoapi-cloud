import type { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { VoipService, VoipServiceError } from '../services/voip_service'

export class VoipController {
  constructor(private readonly service = new VoipService()) {}

  private queryString(req: Request) {
    const url = `${req.originalUrl || req.url || ''}`
    const queryIndex = url.indexOf('?')
    return queryIndex >= 0 ? url.slice(queryIndex) : ''
  }

  private header(req: Request, name: string) {
    const value = req.headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }

  private pipe(upstream: globalThis.Response, res: Response, fallbackContentType: string) {
    res.setHeader('Content-Type', upstream.headers.get('content-type') || fallbackContentType)
    for (const name of ['content-length', 'content-disposition', 'cache-control']) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }
    if (!upstream.body) return res.end()
    return Readable.fromWeb(upstream.body as any).pipe(res)
  }

  private error(res: Response, error: unknown) {
    const status = error instanceof VoipServiceError ? error.status : 500
    return res.status(status).json({ error: error instanceof Error ? error.message : 'voip_service_error' })
  }

  async bootstrap(_req: Request, res: Response) {
    try {
      return res.json(await this.service.bootstrap())
    } catch (error) {
      return this.error(res, error)
    }
  }

  async calls(req: Request, res: Response) {
    try {
      const method = req.method === 'POST' ? 'POST' : 'GET'
      return res.status(method === 'POST' ? 201 : 200).json(
        await this.service.request('/v1/zapo/calls', {
          method,
          body: method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
        }),
      )
    } catch (error) {
      return this.error(res, error)
    }
  }

  async command(req: Request, res: Response) {
    try {
      const command = `${req.params.command || ''}`
      if (!['accept', 'reject', 'end', 'mute'].includes(command)) return res.status(400).json({ error: 'invalid_call_command' })
      return res.json(
        await this.service.request(`/v1/zapo/calls/${encodeURIComponent(req.params.callId)}/${command}`, {
          method: 'POST',
          body: JSON.stringify(req.body || {}),
        }),
      )
    } catch (error) {
      return this.error(res, error)
    }
  }

  async console(req: Request, res: Response) {
    try {
      const suffix = `${req.params[0] || ''}`.replace(/^\/+/, '')
      if (!suffix || suffix.includes('..')) return res.status(400).json({ error: 'invalid_voip_console_path' })
      const method = req.method.toUpperCase()
      return res.json(
        await this.service.request(`/v1/console/${suffix}${this.queryString(req)}`, {
          method,
          body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? JSON.stringify(req.body || {}) : undefined,
        }),
      )
    } catch (error) {
      return this.error(res, error)
    }
  }

  async recording(req: Request, res: Response) {
    try {
      const upstream = await this.service.stream(`/v1/console/history-records/${encodeURIComponent(req.params.recordId)}/recording`)
      if (!upstream.headers.has('content-disposition')) {
        res.setHeader('Content-Disposition', `inline; filename="${req.params.recordId}.mp3"`)
      }
      return this.pipe(upstream, res, 'audio/mpeg')
    } catch (error) {
      return this.error(res, error)
    }
  }

  async transferAudio(req: Request, res: Response) {
    const path = `/v1/console/extensionGroups/${encodeURIComponent(req.params.extensionGroupId)}/transfer-audio${this.queryString(req)}`
    try {
      if (req.method.toUpperCase() === 'PUT') {
        const contentType = this.header(req, 'content-type') || 'application/octet-stream'
        const fileName = this.header(req, 'x-file-name')
        const headers: Record<string, string> = { 'Content-Type': contentType }
        if (fileName) headers['X-File-Name'] = fileName
        return res.json(await this.service.request(path, {
          method: 'PUT',
          headers,
          body: req.body as BodyInit,
        }))
      }

      const upstream = await this.service.stream(path)
      return this.pipe(upstream, res, 'application/octet-stream')
    } catch (error) {
      return this.error(res, error)
    }
  }
}
