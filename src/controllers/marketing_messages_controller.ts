// https://developers.facebook.com/docs/whatsapp/marketing-messages-lite-api/?locale=pt_BR

import { Incoming } from '../services/incoming'
import { Outgoing } from '../services/outgoing'
import { MessagesController } from './messages_controller'
import type { getConfig } from '../services/config'

export class MarketingMessagesController extends MessagesController {

  constructor(incoming: Incoming, outgoing: Outgoing, getConfig: getConfig) {
    super(incoming, outgoing, getConfig)
    this.endpoint = 'marketing_messages'
  }
}
