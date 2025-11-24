import { Request, Response } from 'express'
import fetch from 'node-fetch'
import { EMBEDDED_SIGNUP_APP_ID, EMBEDDED_SIGNUP_APP_SECRET, EMBEDDED_SIGNUP_REDIRECT_URI, EMBEDDED_SIGNUP_GRAPH_VERSION } from '../defaults'
import logger from '../services/logger'

export class EmbeddedController {
  public async configJs(_req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/javascript')
    const appId = EMBEDDED_SIGNUP_APP_ID || ''
    const redirect = EMBEDDED_SIGNUP_REDIRECT_URI || ''
    const version = EMBEDDED_SIGNUP_GRAPH_VERSION || 'v24.0'
    // Sempre retorna JS válido, mesmo que envs não estejam configuradas (evita SyntaxError no front)
    res.status(200).send(`window.EMBEDDED_SIGNUP_APP_ID=${JSON.stringify(appId)};window.EMBEDDED_SIGNUP_REDIRECT_URI=${JSON.stringify(redirect)};window.EMBEDDED_SIGNUP_GRAPH_VERSION=${JSON.stringify(version)};`)
  }

  public async exchange(req: Request, res: Response) {
    try {
      const code = (req.body && (req.body.code || req.body?.data?.code)) || req.query?.code
      if (!code) {
        return res.status(400).json({ error: 'missing_code' })
      }
      if (!EMBEDDED_SIGNUP_APP_ID || !EMBEDDED_SIGNUP_APP_SECRET || !EMBEDDED_SIGNUP_REDIRECT_URI) {
        return res.status(400).json({ error: 'embedded_signup_env_missing' })
      }
      const params = new URLSearchParams({
        client_id: EMBEDDED_SIGNUP_APP_ID,
        client_secret: EMBEDDED_SIGNUP_APP_SECRET,
        redirect_uri: EMBEDDED_SIGNUP_REDIRECT_URI,
        code: code.toString(),
      })
      const version = EMBEDDED_SIGNUP_GRAPH_VERSION || 'v24.0'
      const tokenUrl = `https://graph.facebook.com/${version}/oauth/access_token?${params.toString()}`
      const resp = await fetch(tokenUrl, { method: 'GET' })
      if (!resp.ok) {
        const text = await resp.text()
        logger.warn('Embedded exchange failed %s %s', resp.status, text)
        return res.status(400).json({ error: 'exchange_failed', detail: text })
      }
      const data: any = await resp.json()
      const accessToken = data.access_token
      const payload: any = { token: accessToken, version }

      // Best effort: tentar descobrir waba_id e phone_number_id
      try {
        const me = await fetch(`https://graph.facebook.com/${version}/me/whatsapp_business_accounts`, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (me.ok) {
          const j: any = await me.json()
          const wabaId = Array.isArray(j?.data) && j.data[0]?.id
          if (wabaId) {
            payload.waba_id = wabaId
            try {
              const phones = await fetch(`https://graph.facebook.com/${version}/${wabaId}/phone_numbers`, { headers: { Authorization: `Bearer ${accessToken}` } })
              if (phones.ok) {
                const pj: any = await phones.json()
                const phoneId = Array.isArray(pj?.data) && pj.data[0]?.id
                if (phoneId) {
                  payload.phone_number_id = phoneId
                  payload.phone_numbers = pj.data
                }
              } else {
                try { payload.phone_error = await phones.text() } catch {}
              }
            } catch (e) { logger.debug(e as any, 'ignore phone list error') }
          }
        } else {
          try { payload.waba_error = await me.text() } catch {}
        }
      } catch (e) {
        logger.debug(e as any, 'ignore waba lookup error')
      }
      return res.status(200).json(payload)
    } catch (e) {
      logger.error(e as any, 'embedded exchange error')
      return res.status(500).json({ error: 'internal_error' })
    }
  }
}
