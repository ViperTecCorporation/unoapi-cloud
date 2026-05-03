// https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/

import { Request, Response } from 'express'
import { getConfig } from '../services/config'
import logger from '../services/logger'
import fetch, { Response as FetchResponse, RequestInit } from 'node-fetch'
import { resolveSessionPhoneByMetaId } from '../services/meta_alias'
import { sendGraphError } from '../services/graph_error'

export class TemplatesController {
  private getConfig: getConfig

  constructor(getConfig: getConfig) {
    this.getConfig = getConfig
  }

  public async index(req: Request, res: Response) {
    logger.debug('templates method %s', JSON.stringify(req.method))
    logger.debug('templates headers %s', JSON.stringify(req.headers))
    logger.debug('templates params %s', JSON.stringify(req.params))
    logger.debug('templates body %s', JSON.stringify(req.body))
    logger.debug('templates query %s', JSON.stringify(req.query))

    return this.loadTemplates(req, res)
  }

  public async templates(req: Request, res: Response) {
    logger.debug('message_templates method %s', JSON.stringify(req.method))
    logger.debug('message_templates headers %s', JSON.stringify(req.headers))
    logger.debug('message_templates params %s', JSON.stringify(req.params))
    logger.debug('message_templates body %s', JSON.stringify(req.body))
    logger.debug('message_templates query %s', JSON.stringify(req.query))

    return this.saveTemplate(req, res)
  }

  public async destroy(req: Request, res: Response) {
    logger.debug('delete_template method %s', JSON.stringify(req.method))
    logger.debug('delete_template headers %s', JSON.stringify(req.headers))
    logger.debug('delete_template params %s', JSON.stringify(req.params))
    logger.debug('delete_template body %s', JSON.stringify(req.body))
    logger.debug('delete_template query %s', JSON.stringify(req.query))

    const { templateId } = req.params
    const phone = `${req.params.phone || req.params.business_account_id || ''}`
    const sessionPhone = await resolveSessionPhoneByMetaId(phone)
    try {
      const config = await this.getConfig(sessionPhone)
      const store = await config.getStore(sessionPhone, config)
      const templates = await store.dataStore.loadTemplates()
      const filtered = templates.filter((template: any) => {
        return `${template?.id}` !== `${templateId}` && `${template?.name}` !== `${templateId}`
      })

      if (filtered.length === templates.length) {
        return sendGraphError(res, 404, `template ${templateId} not found`, { code: 100, type: 'GraphMethodException' })
      }

      await store.dataStore.setTemplates(filtered)
      return res.status(200).json({ status: 'success', data: filtered })
    } catch (e) {
      return sendGraphError(res, 400, `${sessionPhone} could not delete template, error: ${e.message}`, { code: 131000, type: 'GraphMethodException' })
    }
  }

  private async loadTemplates(req: Request, res: Response) {
    const phone = `${req.params.phone || req.params.business_account_id || ''}`
    const sessionPhone = await resolveSessionPhoneByMetaId(phone)
    try {
      const config = await this.getConfig(sessionPhone)
      if (config.connectionType == 'forward') {
        const url = `${config.webhookForward.url}/${config.webhookForward.version}/${config.webhookForward.businessAccountId}/message_templates?access_token=${config.webhookForward.token}`
        logger.debug('message_templates forward get templates in url %s', url)
        const options: RequestInit = { method: 'GET' }
        if (config.webhookForward?.timeoutMs) {
          options.signal = AbortSignal.timeout(config.webhookForward?.timeoutMs)
        }
        let response: FetchResponse
        try {
          response = await fetch(url, options)
        } catch (error) {
          logger.error(`Error on get templantes to url ${url}`)
          logger.error(error)
          throw error
        }
        res.setHeader('content-type', 'application/json; charset=UTF-8')
        return response.body.pipe(res)
      } else {
        const store = await config.getStore(sessionPhone, config)
        const templates = await store.dataStore.loadTemplates()
        return res.status(200).json({ data: templates })
      }

    } catch (e) {
      return sendGraphError(res, 400, `${sessionPhone} could not create template, error: ${e.message}`, { code: 131000, type: 'GraphMethodException' })
    }
  }

  private async saveTemplate(req: Request, res: Response) {
    const phone = `${req.params.phone || req.params.business_account_id || ''}`
    const sessionPhone = await resolveSessionPhoneByMetaId(phone)
    const template = req.body

    try {
      if (!template || typeof template !== 'object' || Array.isArray(template)) {
        return sendGraphError(res, 400, 'template body must be a JSON object', { code: 100, type: 'GraphMethodException' })
      }
      if (!template.id) {
        return sendGraphError(res, 400, 'template id is required', { code: 100, type: 'GraphMethodException' })
      }

      const config = await this.getConfig(sessionPhone)
      const store = await config.getStore(sessionPhone, config)
      const templates = await store.dataStore.loadTemplates()
      const nextTemplates = templates.filter((current: any) => `${current?.id}` !== `${template.id}`)
      nextTemplates.push(template)

      await store.dataStore.setTemplates(nextTemplates)
      return res.status(200).json({ status: 'success', data: template })
    } catch (e) {
      return sendGraphError(res, 400, `${sessionPhone} could not create template, error: ${e.message}`, { code: 131000, type: 'GraphMethodException' })
    }
  }
}
