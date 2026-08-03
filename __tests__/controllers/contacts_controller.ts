import { ContactsController, parseSaveContactInput } from '../../src/controllers/contacts_controller'
import type { Contact } from '../../src/services/contact'
import type { ContactDirectory } from '../../src/services/contacts/contact_directory_types'
import type { ContactBook } from '../../src/services/contacts/contact_book'
import { SendError } from '../../src/services/send_error'

const response = () => {
  const res = {
    status: jest.fn(),
    send: jest.fn(),
  }
  res.status.mockReturnValue(res)
  res.send.mockReturnValue(res)
  return res
}

describe('ContactsController directory', () => {
  const verifier = { verify: jest.fn() } as unknown as Contact

  test('returns the verification contract without nesting contacts twice', async () => {
    const verification = {
      contacts: [
        {
          input: '5566996890270',
          wa_id: '556696890270',
          user_id: '273877414502425@lid',
          display_name: 'Amor Vida',
          status: 'valid',
        },
      ],
    }
    const verify = jest.fn().mockResolvedValue(verification)
    const controller = new ContactsController({ verify } as unknown as Contact)
    const res = response()

    await controller.post(
      {
        params: { phone: '5566996269251' },
        body: { contacts: ['5566996890270'] },
        method: 'POST',
        headers: {},
      } as never,
      res as never,
    )

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(verification)
  })

  test('returns a provider conflict without leaving an unhandled rejection', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('409: zapo_session_owned_by_another_worker'))
    const controller = new ContactsController({ verify } as unknown as Contact)
    const res = response()

    await controller.post(
      {
        params: { phone: '5566996269251' },
        body: { contacts: ['5566996890270'] },
        method: 'POST',
        headers: {},
      } as never,
      res as never,
    )

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.send).toHaveBeenCalledWith({ error: 'zapo_session_owned_by_another_worker' })
  })

  test('returns 503 when contact verification has no reliable network or store result', async () => {
    const verify = jest.fn().mockRejectedValue(new SendError(503, 'zapo_contact_lookup_unavailable'))
    const controller = new ContactsController({ verify } as unknown as Contact)
    const res = response()

    await controller.post(
      {
        params: { phone: '5566996269251' },
        body: { contacts: ['5566996890270'] },
        method: 'POST',
        headers: {},
      } as never,
      res as never,
    )

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.send).toHaveBeenCalledWith({ error: 'zapo_contact_lookup_unavailable' })
  })

  test('returns 503 when contact import cannot resolve a canonical LID', async () => {
    const contactBook = {
      save: jest.fn().mockRejectedValue(new SendError(503, 'zapo_contact_lookup_unavailable')),
    } as unknown as ContactBook
    const controller = new ContactsController(verifier, undefined, contactBook)
    const res = response()

    await controller.save(
      {
        params: { phone: '5566996269251' },
        body: { phone_number: '5566996890270', full_name: 'Maria' },
      } as never,
      res as never,
    )

    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.send).toHaveBeenCalledWith({ error: 'zapo_contact_lookup_unavailable' })
  })

  test('returns the requested directory page', async () => {
    const page = { contacts: [], next_cursor: '0', has_more: false, total_count: 0, raw_total_count: 0, ignored_count: 0 }
    const directory = { list: jest.fn().mockResolvedValue(page) } as unknown as ContactDirectory
    const controller = new ContactsController(verifier, directory)
    const res = response()

    await controller.get({ params: { phone: '5566' }, query: { cursor: '8', limit: '25' } } as never, res as never)

    expect(directory.list).toHaveBeenCalledWith('5566', {
      cursor: '8',
      limit: 25,
      search: undefined,
    })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(page)
  })

  test('passes the trimmed search query to the directory', async () => {
    const directory = {
      list: jest.fn().mockResolvedValue({
        contacts: [],
        next_cursor: '0',
        has_more: false,
        total_count: 0,
        raw_total_count: 0,
        ignored_count: 0,
      }),
    } as unknown as ContactDirectory
    const controller = new ContactsController(verifier, directory)
    const res = response()

    await controller.get(
      {
        params: { phone: '5566' },
        query: { search: '  Maria  ' },
      } as never,
      res as never,
    )

    expect(directory.list).toHaveBeenCalledWith('5566', {
      cursor: undefined,
      limit: undefined,
      search: 'Maria',
    })
  })

  test.each([
    [{ limit: '0' }, 'limit_must_be_between_1_and_200'],
    [{ limit: '201' }, 'limit_must_be_between_1_and_200'],
    [{ cursor: 'next' }, 'cursor_must_be_numeric'],
    [{ search: 'x'.repeat(101) }, 'search_must_have_at_most_100_characters'],
  ])('rejects invalid pagination query %j', async (query, expectedError) => {
    const directory = { list: jest.fn() } as unknown as ContactDirectory
    const controller = new ContactsController(verifier, directory)
    const res = response()

    await controller.get({ params: { phone: '5566' }, query } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ error: expectedError })
    expect(directory.list).not.toHaveBeenCalled()
  })

  test('returns a conflict for a Baileys session', async () => {
    const directory = { list: jest.fn().mockRejectedValue(new SendError(409, 'contact_directory_requires_zapo_provider')) }
    const controller = new ContactsController(verifier, directory)
    const res = response()

    await controller.get({ params: { phone: '5566' }, query: {} } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.send).toHaveBeenCalledWith({ error: 'contact_directory_requires_zapo_provider' })
  })

  test('reports when no directory service was configured', async () => {
    const controller = new ContactsController(verifier)
    const res = response()

    await controller.get({ params: { phone: '5566' }, query: {} } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(501)
  })

  test('normalizes and saves an address-book contact', async () => {
    const save = jest.fn().mockResolvedValue({
      success: true,
      contact: {
        phone_number: '5511988887777',
        full_name: 'Maria Silva',
        first_name: 'Maria',
        user_id: '123@lid',
      },
    })
    const controller = new ContactsController(verifier, undefined, { save } as unknown as ContactBook)
    const res = response()

    await controller.save({
      params: { phone: '5566999554300' },
      body: {
        phone_number: '+55 (11) 98888-7777',
        full_name: '  Maria Silva  ',
        user_id: '123@lid',
      },
    } as never, res as never)

    expect(save).toHaveBeenCalledWith('5566999554300', {
      phone_number: '5511988887777',
      full_name: 'Maria Silva',
      user_id: '123@lid',
    })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  test.each([
    [{ phone_number: '123', full_name: 'Maria' }, 'contact_phone_number_must_have_7_to_15_digits'],
    [{ phone_number: '5511988887777', full_name: '' }, 'contact_full_name_must_have_1_to_256_characters'],
    [{ phone_number: '5511988887777', full_name: 'Maria', user_id: '123' }, 'contact_user_id_must_be_a_lid'],
  ])('rejects an invalid address-book payload %j', async (body, expectedError) => {
    const save = jest.fn()
    const controller = new ContactsController(verifier, undefined, { save } as unknown as ContactBook)
    const res = response()

    await controller.save({ params: { phone: '5566' }, body } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.send).toHaveBeenCalledWith({ error: expectedError })
    expect(save).not.toHaveBeenCalled()
  })

  test('preserves a provider HTTP error returned through AMQP RPC', async () => {
    const save = jest.fn().mockRejectedValue(new Error('409: zapo_session_owned_by_another_worker'))
    const controller = new ContactsController(verifier, undefined, { save } as unknown as ContactBook)
    const res = response()

    await controller.save({
      params: { phone: '5566' },
      body: { phone_number: '5511988887777', full_name: 'Maria' },
    } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.send).toHaveBeenCalledWith({ error: 'zapo_session_owned_by_another_worker' })
  })

  test('keeps optional address-book fields normalized', () => {
    expect(parseSaveContactInput({
      phone_number: '5511988887777',
      full_name: 'Maria Silva',
      first_name: ' Maria ',
      username: '@maria',
    })).toEqual({
      phone_number: '5511988887777',
      full_name: 'Maria Silva',
      first_name: 'Maria',
      username: 'maria',
    })
  })
})
