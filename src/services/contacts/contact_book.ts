import type { SaveContactInput, SaveContactResponse } from './contact_book_types'

export interface ContactBook {
  save(phone: string, input: SaveContactInput): Promise<SaveContactResponse>
}
