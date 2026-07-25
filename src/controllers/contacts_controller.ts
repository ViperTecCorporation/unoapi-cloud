import { Request, Response } from 'express'
import logger from '../services/logger'
import { Contact } from '../services/contact'
import type { ContactDirectory } from '../services/contacts/contact_directory_types'
import { SendError } from '../services/send_error'

export class ContactsController {
  private service: Contact

  constructor(
    service: Contact,
    private readonly directory?: ContactDirectory,
  ) {
    this.service = service
  }

  public async get(req: Request, res: Response) {
    if (!this.directory) return res.status(501).send({ error: 'contact_directory_not_configured' })
    const limit = req.query.limit === undefined ? undefined : Number(req.query.limit)
    const cursor = req.query.cursor === undefined ? undefined : `${req.query.cursor}`
    const search = req.query.search === undefined ? undefined : `${req.query.search}`.trim()
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
      return res.status(400).send({ error: 'limit_must_be_between_1_and_200' })
    }
    if (cursor !== undefined && !/^\d+$/.test(cursor)) {
      return res.status(400).send({ error: 'cursor_must_be_numeric' })
    }
    if (search && search.length > 100) {
      return res.status(400).send({ error: 'search_must_have_at_most_100_characters' })
    }

    try {
      return res.status(200).send(await this.directory.list(req.params.phone, { cursor, limit, search }))
    } catch (error) {
      if (error instanceof SendError && error.code >= 400 && error.code <= 599) {
        return res.status(error.code).send({ error: error.title })
      }
      throw error
    }
  }

  public async post(req: Request, res: Response) {
    logger.debug('contacts post method %s', req.method)
    logger.debug('contacts post headers %s', JSON.stringify(req.headers))
    logger.debug('contacts post params %s', JSON.stringify(req.params))
    logger.debug('contacts post body %s', JSON.stringify(req.body))
    const { phone } = req.params
    try {
      const contacts = await this.service.verify(phone, req.body.contacts || [], req.body.webhook)
      return res.status(200).send(contacts)
    } catch (error) {
      const message = `${(error as Error)?.message || 'contact_verification_failed'}`
      const statusFromMessage = Number(message.match(/^(\d{3}):/)?.[1])
      const status = error instanceof SendError ? error.code : statusFromMessage >= 400 && statusFromMessage <= 599 ? statusFromMessage : 500
      logger.warn(error as Error, 'Contact verification failed for %s', phone)
      return res.status(status).send({ error: message.replace(/^\d{3}:\s*/, '') })
    }
  }
}
