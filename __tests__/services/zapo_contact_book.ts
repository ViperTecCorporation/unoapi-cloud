import { ZapoContactBook } from '../../src/services/zapo/zapo_contact_book'

const contactStore = (records: Record<string, any> = {}) => {
  const values = new Map(Object.entries(records))
  return {
    getByJid: jest.fn(async (jid: string) => values.get(jid) || null),
    getByPhoneNumber: jest.fn(async () => null),
    upsertBatch: jest.fn(async (items: any[]) => {
      for (const item of items) values.set(item.jid, item)
    }),
    upsert: jest.fn(async (item: any) => {
      values.set(item.jid, item)
    }),
  }
}

describe('ZapoContactBook', () => {
  test('uses the exact PN stored for a supplied LID and saves the official Contact mutation', async () => {
    const contacts = contactStore({
      '53515477086263@lid': {
        jid: '53515477086263@lid',
        lid: '53515477086263@lid',
        phoneNumber: '556699069708',
        lastUpdatedMs: 1,
      },
    })
    const set = jest.fn().mockResolvedValue(undefined)
    const profileLookup = jest.fn()
    const client = { chat: { set }, profile: { getLidsByPhoneNumbers: profileLookup } }
    const service = new ZapoContactBook(client as never, { contacts } as never, '5566999554300')

    await expect(service.save({
      phone_number: '5566999069708',
      full_name: 'Fran Fernandes',
      first_name: 'Fran',
      user_id: '53515477086263@lid',
      username: '@fran',
    })).resolves.toEqual({
      success: true,
      contact: {
        phone_number: '556699069708',
        full_name: 'Fran Fernandes',
        first_name: 'Fran',
        user_id: '53515477086263@lid',
        username: 'fran',
      },
    })

    expect(profileLookup).not.toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith({
      schema: 'Contact',
      id: '556699069708@s.whatsapp.net',
      fullName: 'Fran Fernandes',
      firstName: 'Fran',
      lidJid: '53515477086263@lid',
      pnJid: '556699069708@s.whatsapp.net',
      saveOnPrimaryAddressbook: true,
      username: 'fran',
    })
    expect(contacts.upsert).toHaveBeenCalledWith(expect.objectContaining({
      jid: '53515477086263@lid',
      phoneNumber: '556699069708',
      displayName: 'Fran Fernandes',
    }))
  })

  test('resolves a missing LID through Zapo and derives the first name', async () => {
    const contacts = contactStore()
    const set = jest.fn().mockResolvedValue(undefined)
    const client = {
      chat: { set },
      profile: {
        getLidsByPhoneNumbers: jest.fn().mockResolvedValue([{
          queriedJid: '5511988887777@s.whatsapp.net',
          phoneJid: '5511988887777@s.whatsapp.net',
          lidJid: '123456789@lid',
          exists: true,
        }]),
      },
    }
    const service = new ZapoContactBook(client as never, { contacts } as never, '5566999554300')

    const result = await service.save({
      phone_number: '+55 11 98888-7777',
      full_name: 'Maria Silva',
    })

    expect(result.contact).toEqual({
      phone_number: '5511988887777',
      full_name: 'Maria Silva',
      first_name: 'Maria',
      user_id: '123456789@lid',
    })
    expect(set).toHaveBeenCalledTimes(1)
  })

  test('does not invent a PN when the supplied LID is absent from the Zapo store', async () => {
    const contacts = contactStore()
    const service = new ZapoContactBook(
      { chat: { set: jest.fn() }, profile: { getLidsByPhoneNumbers: jest.fn() } } as never,
      { contacts } as never,
      '5566999554300',
    )

    await expect(service.save({
      phone_number: '5566999069708',
      full_name: 'Fran',
      user_id: '53515477086263@lid',
    })).rejects.toThrow('zapo_contact_phone_not_found')
  })

  test('rejects an empty name even when called outside the HTTP controller', async () => {
    const contacts = contactStore()
    const service = new ZapoContactBook(
      { chat: { set: jest.fn() }, profile: { getLidsByPhoneNumbers: jest.fn() } } as never,
      { contacts } as never,
      '5566999554300',
    )
    await expect(service.save({ phone_number: '5511988887777', full_name: '' }))
      .rejects.toThrow('contact_full_name_is_required')
  })
})
