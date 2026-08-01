import { ContactBookIncoming } from '../../src/services/contacts/contact_book_incoming'

describe('ContactBookIncoming', () => {
  test('delegates the contact to the selected provider worker', async () => {
    const saveContact = jest.fn().mockResolvedValue({ success: true, contact: {} })
    const service = new ContactBookIncoming({ saveContact } as never)
    const input = { phone_number: '5511988887777', full_name: 'Maria Silva' }

    await service.save('5566999554300', input)

    expect(saveContact).toHaveBeenCalledWith('5566999554300', input)
  })

  test('reports an explicit capability error when the provider lacks the operation', async () => {
    const service = new ContactBookIncoming({} as never)
    await expect(service.save('5566', { phone_number: '5511988887777', full_name: 'Maria' }))
      .rejects.toThrow('does not support address-book contacts')
  })
})
