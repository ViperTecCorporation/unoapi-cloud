import { Request, Response } from 'express'
import logger from '../services/logger'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import YAML from 'yaml'
import { UNOAPI_AUTH_TOKEN } from '../defaults'
import { getAllAuthTokens } from '../services/redis'

class IndexController {

  public root(req: Request, res: Response) {
    logger.debug('root method %s', JSON.stringify(req.method))
    logger.debug('root headers %s', JSON.stringify(req.headers))
    logger.debug('root params %s', JSON.stringify(req.params))
    logger.debug('root body %s', JSON.stringify(req.body))
    res.set('Content-Type', 'text/html')
    //return res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'))
    return res.sendFile(path.resolve('./public/index.html'))
  }

  public socket(req: Request, res: Response) {
    logger.debug('socket method %s', JSON.stringify(req.method))
    logger.debug('socket headers %s', JSON.stringify(req.headers))
    logger.debug('socket params %s', JSON.stringify(req.params))
    logger.debug('socket body %s', JSON.stringify(req.body))
    try {
      // Avoid package "exports" subpath issues by checking known files directly.
      const reqr = createRequire(__filename as unknown as string)
      const base = path.dirname(reqr.resolve('socket.io-client/package.json'))
      const candidates = [
        path.join(base, 'dist', 'socket.io.min.js'),
        path.join(base, 'dist', 'socket.io.js'),
      ]
      const found = candidates.find((p) => fs.existsSync(p))
      if (found) {
        res.type('application/javascript')
        return res.sendFile(found)
      }
    } catch {}

    logger.warn('Socket.io client local asset not found; redirecting to CDN')
    return res.redirect(302, 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.min.js')
  }

  public docs(req: Request, res: Response) {
    // Serve docs index at /docs
    res.type('text/html')
    return res.sendFile(path.resolve('./public/docs/index.html'))
  }

  public docsOpenapiHtml(_req: Request, res: Response) {
    res.type('text/html')
    return res.sendFile(path.resolve('./public/docs/openapi.html'))
  }

  public docsSwaggerHtml(_req: Request, res: Response) {
    res.type('text/html')
    return res.sendFile(path.resolve('./public/docs/swagger.html'))
  }

  public docsFile(req: Request, res: Response) {
    // Serve files from /docs, allowing dotfiles (e.g., .env.example)
    const file = (req.params as any)[0] || ''
    const safe = path.normalize(file).replace(/^\.\.(?:[\/\\]|$)/, '')
    const target = path.resolve('./docs', safe)
    return res.sendFile(target, { dotfiles: 'allow' }, (err) => {
      if (err) {
        // Fallback: explicitly set plain text for unknown extensions
        try {
          if (!fs.existsSync(target)) return res.status(404).send('Not found')
          const data = fs.readFileSync(target)
          res.set('Content-Type', 'text/plain')
          return res.status(200).send(data)
        } catch {
          return res.status(404).send('Not found')
        }
      }
    })
  }

  public docsOpenApiJson(_req: Request, res: Response) {
    try {
      const p = path.resolve('./docs/openapi.yaml')
      const raw = fs.readFileSync(p, 'utf-8')
      const obj = YAML.parse(raw)
      res.type('application/json')
      return res.status(200).send(JSON.stringify(obj))
    } catch (e) {
      return res.status(404).json({ error: 'openapi.yaml not found or invalid' })
    }
  }

  public logos(req: Request, res: Response) {
    const file = (req.params as any)[0] || ''
    const safe = path.normalize(file).replace(/^\.\.(?:[\/\\]|$)/, '')
    const target = path.resolve('./logos', safe)
    return res.sendFile(target)
  }

  public favicon(_req: Request, res: Response) {
    // respond with no content to avoid 404 noise if favicon is not present
    return res.sendStatus(204)
  }

  public ping(req: Request, res: Response) {
    logger.debug('ping method %s', JSON.stringify(req.method))
    logger.debug('ping headers %s', JSON.stringify(req.headers))
    logger.debug('ping params %s', JSON.stringify(req.params))
    logger.debug('ping body %s', JSON.stringify(req.body))
    res.set('Content-Type', 'text/plain')
    return res.status(200).send('pong!')
  }

  public async debugToken(req: Request, res: Response) {
    logger.debug('debug token method %s', JSON.stringify(req.method))
    logger.debug('debug token headers %s', JSON.stringify(req.headers))
    logger.debug('debug token params %s', JSON.stringify(req.params))
    logger.debug('debug token query %s', JSON.stringify(req.query))
    logger.debug('debug token body %s', JSON.stringify(req.body))
    const inputToken = `${(req.query as any)?.input_token || (req.query as any)?.access_token || ''}`.trim()
    const appId = `${process.env.EMBEDDED_SIGNUP_APP_ID || 'unoapi'}`
    const scopes = ['whatsapp_business_management', 'whatsapp_business_messaging']
    let isValid = false
    try {
      const validTokens = new Set<string>()
      if (UNOAPI_AUTH_TOKEN) validTokens.add(UNOAPI_AUTH_TOKEN)
      try {
        const redisTokens = await getAllAuthTokens()
        redisTokens.forEach((t) => t && validTokens.add(`${t}`))
      } catch {}
      // Keep backward compatibility: when no known token source exists, respond valid.
      if (!inputToken && validTokens.size === 0) {
        isValid = true
      } else if (inputToken) {
        isValid = validTokens.has(inputToken)
      }
    } catch {}
    res.set('Content-Type', 'application/json')
    return res.status(200).send({
      data: {
        is_valid: isValid,
        app_id: appId,
        application: 'unoapi',
        expires_at: isValid ? Math.floor(Date.now() / 1000) + 86400 : 0,
        scopes: isValid ? scopes : [],
      },
    })
  }
}

export const indexController = new IndexController()
