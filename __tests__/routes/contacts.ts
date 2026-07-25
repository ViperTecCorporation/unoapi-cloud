import express from 'express'
import request from 'supertest'
import { mock } from 'jest-mock-extended'
import { ContactsController } from '../../src/controllers/contacts_controller'
import type { Contact } from '../../src/services/contact'
import type { ContactDirectory } from '../../src/services/contacts/contact_directory_types'

describe('contacts directory route', () => {
  test('serves the contact directory page through GET /:phone/contacts', async () => {
    const page = {
      contacts: [
        {
          user_id: '123@lid',
          phone_number: '5566999554300',
          push_name: 'Maria',
          last_updated_ms: 1710000000000,
        },
      ],
      next_cursor: '0',
      has_more: false,
      total_count: 1,
    }
    const directory: ContactDirectory = {
      list: jest.fn().mockResolvedValue(page),
    }
    const controller = new ContactsController(mock<Contact>(), directory)
    const app = express()
    app.get('/:phone/contacts', controller.get.bind(controller))

    const response = await request(app).get('/5566/contacts?limit=20').expect(200)

    expect(directory.list).toHaveBeenCalledWith('5566', {
      cursor: undefined,
      limit: 20,
      search: undefined,
    })
    expect(response.body).toEqual(page)
  })
})
