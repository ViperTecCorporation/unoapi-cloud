import { Request, Response } from 'express'
import { Outgoing } from '../services/outgoing'
import logger from '../services/logger'
import { UNOAPI_AUTH_TOKEN } from '../defaults'
import { getConfig } from '../services/config'
import { registerMetaWebhookWindow } from '../services/coexistence_window'
import { getPhoneByPhoneNumberId } from '../services/redis'

export class WebhookController {
  private service: Outgoing
  private getConfig: getConfig

  constructor(service: Outgoing, getConfig: getConfig) {
    this.service = service
    this.getConfig = getConfig
  }

  public async whatsapp(req: Request, res: Response) {
    logger.debug('webhook whatsapp method %s', req.method)
    logger.debug('webhook whatsapp headers %s', JSON.stringify(req.headers))
    logger.debug('webhook whatsapp params %s', JSON.stringify(req.params))
    logger.debug('webhook whatsapp body %s', JSON.stringify(req.body))
    const { phone } = req.params
    try {
      const config = await this.getConfig(phone.replace('+', ''))
      if (config?.coexistenceEnabled) {
        await registerMetaWebhookWindow(phone, req.body, config.coexistenceWindowSeconds)
      }
    } catch (e) {
      logger.warn(e as any, 'Ignore error registering coexistence window for %s', phone)
    }
    await this.service.send(phone, req.body)
    res.status(200).send(`{"success": true}`)
  }

  public async whatsappNoParam(req: Request, res: Response) {
    logger.debug('webhook whatsapp (no phone) method %s', req.method)
    const body = req.body || {}
    const phoneNumberId = (() => {
      try { return body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id } catch { return undefined }
    })()
    const displayPhone = (() => {
      try { return body.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number } catch { return undefined }
    })()
    let phone = ''
    if (phoneNumberId) {
      phone = (await getPhoneByPhoneNumberId(phoneNumberId)) || ''
    }
    if (!phone && displayPhone) {
      phone = `${displayPhone}`.replace(/\D/g, '')
    }
    if (!phone) {
      logger.warn('Cannot resolve session phone for webhook (phone_number_id=%s display=%s)', phoneNumberId, displayPhone)
      return res.status(400).json({ error: 'unknown_phone_number_id' })
    }
    try {
      const config = await this.getConfig(phone.replace('+', ''))
      if (config?.coexistenceEnabled) {
        await registerMetaWebhookWindow(phone, body, config.coexistenceWindowSeconds)
      }
    } catch (e) {
      logger.warn(e as any, 'Ignore error registering coexistence window for %s', phone)
    }
    try {
      await this.service.send(phone, body)
      res.status(200).send(`{"success": true}`)
    } catch (e) {
      logger.error(e as any, 'error on webhook (no param)')
      res.status(500).send(`{"success": false}`)
    }
  }

  public async whatsappVerify(req: Request, res: Response) {
    logger.debug('webhook whatsapp verify method %s', req.method)
    logger.debug('webhook whatsapp verify headers %s', JSON.stringify(req.headers))
    logger.debug('webhook whatsapp verify params %s', JSON.stringify(req.params))
    logger.debug('webhook whatsapp verify body %s', JSON.stringify(req.body))
    logger.debug('webhook whatsapp verify query %s', JSON.stringify(req.query))
    const { phone } = req.params

    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    const config = (await this.getConfig(phone.replace('+', ''))) || { authToken: UNOAPI_AUTH_TOKEN }
  
    if (mode === 'subscribe' && token === config.authToken) {
      res.status(200).send(challenge)
    } else {
      res.sendStatus(403)
    }
  }

  public async whatsappVerifyNoParam(req: Request, res: Response) {
    logger.debug('webhook whatsapp verify (no param) method %s', req.method)
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    const expectedToken = UNOAPI_AUTH_TOKEN
    if (mode === 'subscribe' && token === expectedToken) {
      res.status(200).send(challenge)
    } else {
      res.sendStatus(403)
    }
  }
}
