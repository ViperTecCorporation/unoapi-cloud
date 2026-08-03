import type { Request, Response } from 'express'
import { VoipService, VoipServiceError } from '../services/voip_service'

export class VoipController {
  constructor(private readonly service = new VoipService()) {}

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
        await this.service.request(`/v1/console/${suffix}`, {
          method,
          body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? JSON.stringify(req.body || {}) : undefined,
        }),
      )
    } catch (error) {
      return this.error(res, error)
    }
  }
}
