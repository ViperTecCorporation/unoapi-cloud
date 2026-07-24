import { Contact as ContactRow } from './client'

export interface ContactResponse {
  contacts: ContactRow[]
}

export interface Contact {
  verify(phone: string, numbers: string[], webhook: string | undefined): Promise<ContactResponse>
}
