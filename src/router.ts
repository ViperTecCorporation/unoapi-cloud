import { indexController } from './controllers/index_controller'
import { webhookController } from './controllers/webhook_controller'
import { templatesController } from './controllers/templates_controller'
import { MessagesController } from './controllers/messages_controller'
import { MediaController } from './controllers/media_controller'
import { Incoming } from './services/incoming'
import { getDataStore } from './services/data_store'
import { getMediaStore } from './services/media_store'
import { Outgoing } from './services/outgoing'
import middleware from './services/middleware'
import injectRoute from './services/inject_route'
import { Request, Response, NextFunction, Router } from 'express'

export const router = async (
  incoming: Incoming,
  outgoing: Outgoing,
  baseUrl: string,
  getMediaStore: getMediaStore,
  getDataStore: getDataStore,
  middleware: middleware = async (req: Request, res: Response, next: NextFunction) => next(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
  injectRoute: injectRoute = async (router: Router) => {},
) => {
  const router: Router = Router()
  const messagesController = new MessagesController(incoming, outgoing)
  const messages = messagesController.index.bind(messagesController)
  const mediaController = new MediaController(baseUrl, getMediaStore, getDataStore)
  const index = mediaController.index.bind(mediaController)
  const download = mediaController.download.bind(mediaController)

  //Routes
  router.get('/ping', indexController.ping)
  router.get('/:version/:phone/message_templates', middleware, templatesController.index)
  router.post('/:version/:phone/messages', middleware, messages)
  router.get('/:version/:phone/:media_id', middleware, index)
  router.get('/:version/download/:phone/:file', middleware, download)

  await injectRoute(router)

  // Webhook for tests
  router.post('/webhooks/whatsapp/:phone', webhookController.whatsapp)
  return router
}
