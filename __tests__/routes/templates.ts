import request from 'supertest'
import { mock } from 'jest-mock-extended'

import { App } from '../../src/app'
import { Incoming } from '../../src/services/incoming'
import { Outgoing } from '../../src/services/outgoing'
import { getStore, Store } from '../../src/services/store'
import { Config, getConfig } from '../../src/services/config'
import { DataStore } from '../../src/services/data_store'
import { SessionStore } from '../../src/services/session_store'
import { OnNewLogin } from '../../src/services/socket'
import { addToBlacklist } from '../../src/services/blacklist'
import { Reload } from '../../src/services/reload'
import { Logout } from '../../src/services/logout'
const addToBlacklist = mock<addToBlacklist>()

const sessionStore = mock<SessionStore>()
const store = mock<Store>()
const config = mock<Config>()
const dataStore = mock<DataStore>()
const getConfig = mock<getConfig>()
const onNewLogin = mock<OnNewLogin>()
const reload = mock<Reload>()
const logout = mock<Logout>()

const loadTemplates = jest.spyOn(dataStore, 'loadTemplates')
loadTemplates.mockResolvedValue([])
const setTemplates = jest.spyOn(dataStore, 'setTemplates')
setTemplates.mockResolvedValue()
const getStore = jest.spyOn(config, 'getStore')
getStore.mockResolvedValue(store)
store.dataStore = dataStore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getConfigTest: getConfig = async (_phone: string) => {
  return config
}

describe('templates routes', () => {
  test('index', async () => {
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const app: App = new App(incoming, outgoing, '', getConfigTest, sessionStore, onNewLogin, addToBlacklist, reload, logout)
    const res = await request(app.server).get('/v15.0/123/message_templates')
    expect(res.status).toEqual(200)
  })

  test('save template', async () => {
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const app: App = new App(incoming, outgoing, '', getConfigTest, sessionStore, onNewLogin, addToBlacklist, reload, logout)
    const res = await request(app.server)
      .post('/v15.0/123/templates')
      .send({ id: 1, name: 'hello' })

    expect(res.status).toEqual(200)
    expect(setTemplates).toHaveBeenCalledWith([{ id: 1, name: 'hello' }])
  })

  test('delete template by id', async () => {
    loadTemplates.mockResolvedValueOnce([{ id: 1, name: 'hello' }, { id: 2, name: 'other' }])
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const app: App = new App(incoming, outgoing, '', getConfigTest, sessionStore, onNewLogin, addToBlacklist, reload, logout)
    const res = await request(app.server).delete('/v15.0/123/templates/1')

    expect(res.status).toEqual(200)
    expect(setTemplates).toHaveBeenCalledWith([{ id: 2, name: 'other' }])
  })
})
