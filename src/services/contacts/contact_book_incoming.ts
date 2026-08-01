import type { Incoming } from '../incoming'
import type { ContactBook } from './contact_book'
import type { SaveContactInput, SaveContactResponse } from './contact_book_types'

export class ContactBookIncoming implements ContactBook {
  constructor(private readonly incoming: Incoming) {}

  async save(phone: string, input: SaveContactInput): Promise<SaveContactResponse> {
    if (typeof this.incoming.saveContact !== 'function') {
      throw new Error('Incoming provider does not support address-book contacts')
    }
    return this.incoming.saveContact(phone, input)
  }
}
