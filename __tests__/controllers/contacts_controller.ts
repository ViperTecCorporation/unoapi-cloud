import { ContactsController } from '../../src/controllers/contacts_controller'
import type { Contact } from '../../src/services/contact'
import type { ContactDirectory } from '../../src/services/contacts/contact_directory_types'
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
      contacts: [{
        input: '5566996890270',
        wa_id: '556696890270',
        user_id: '273877414502425@lid',
        display_name: 'Amor Vida',
        status: 'valid',
      }],
    }
    const verify = jest.fn().mockResolvedValue(verification)
    const controller = new ContactsController({ verify } as unknown as Contact)
    const res = response()

    await controller.post({
      params: { phone: '5566996269251' },
      body: { contacts: ['5566996890270'] },
      method: 'POST',
      headers: {},
    } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(verification)
  })

  test('returns a provider conflict without leaving an unhandled rejection', async () => {
    const verify = jest.fn().mockRejectedValue(new Error('409: zapo_session_owned_by_another_worker'))
    const controller = new ContactsController({ verify } as unknown as Contact)
    const res = response()

    await controller.post({
      params: { phone: '5566996269251' },
      body: { contacts: ['5566996890270'] },
      method: 'POST',
      headers: {},
    } as never, res as never)

    expect(res.status).toHaveBeenCalledWith(409)
    expect(res.send).toHaveBeenCalledWith({ error: 'zapo_session_owned_by_another_worker' })
  })

  test('returns the requested directory page', async () => {
    const page = { contacts: [], next_cursor: '0', has_more: false }
    const directory = { list: jest.fn().mockResolvedValue(page) } as unknown as ContactDirectory
    const controller = new ContactsController(verifier, directory)
    const res = response()

    await controller.get({ params: { phone: '5566' }, query: { cursor: '8', limit: '25' } } as never, res as never)

    expect(directory.list).toHaveBeenCalledWith('5566', { cursor: '8', limit: 25 })
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(page)
  })

  test.each([
    [{ limit: '0' }, 'limit_must_be_between_1_and_200'],
    [{ limit: '201' }, 'limit_must_be_between_1_and_200'],
    [{ cursor: 'next' }, 'cursor_must_be_numeric'],
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
})
