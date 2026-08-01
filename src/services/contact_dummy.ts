import { Contact, ContactResponse } from './contact';

export class ContactDummy implements Contact {
  public async verify(_phone: string, _numbers: string[], _webhook: string | undefined) {
    return { contacts: [] } as ContactResponse
  }
}