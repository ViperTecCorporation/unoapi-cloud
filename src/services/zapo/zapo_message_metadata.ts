import { clients, type Client } from '../client'

export interface ZapoMessageMetadataResolver {
  resolve<T>(phone: string, message: T): Promise<T>
}

type ClientLookup = (phone: string) => Client | undefined

export class ActiveZapoMessageMetadataResolver implements ZapoMessageMetadataResolver {
  constructor(private readonly getClient: ClientLookup = (phone) => clients.get(phone)) {}

  async resolve<T>(phone: string, message: T): Promise<T> {
    const client = this.getClient(phone)
    return client ? client.getMessageMetadata(message) : message
  }
}

export const activeZapoMessageMetadataResolver = new ActiveZapoMessageMetadataResolver()
