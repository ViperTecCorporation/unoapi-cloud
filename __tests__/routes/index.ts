import request from 'supertest'
import { mock } from 'jest-mock-extended'

import { App } from '../../src/app'
import { Incoming } from '../../src/services/incoming'
import { getConfig } from '../../src/services/config'
import { Outgoing } from '../../src/services/outgoing'
import { SessionStore } from '../../src/services/session_store'
import { OnNewLogin } from '../../src/services/socket'
import { addToBlacklist } from '../../src/services/blacklist'
import { Reload } from '../../src/services/reload'
import { Logout } from '../../src/services/logout'
import { versionStatusService } from '../../src/services/version_status'
const addToBlacklist = mock<addToBlacklist>()
const sessionStore = mock<SessionStore>()

describe('index routes', () => {
  test('ping', async () => {
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const getConfig = mock<getConfig>()
    const onNewLogin = mock<OnNewLogin>()
    const reload = mock<Reload>()
    const logout = mock<Logout>()
    const app: App = new App(incoming, outgoing, '', getConfig, sessionStore, onNewLogin, addToBlacklist, reload, logout)
    const res = await request(app.server).get('/ping')
    expect(res.text).toEqual('pong!')
  })

  test('returns installed and latest application versions', async () => {
    const status = {
      installed_version: '4.0.0-beta7',
      latest_version: '4.0.0-beta8',
      update_available: true,
      status: 'update_available' as const,
      checked_at: '2026-07-25T12:00:00.000Z',
    }
    const getVersion = jest.spyOn(versionStatusService, 'get').mockResolvedValue(status)
    const app = new App(
      mock<Incoming>(),
      mock<Outgoing>(),
      '',
      mock<getConfig>(),
      sessionStore,
      mock<OnNewLogin>(),
      addToBlacklist,
      mock<Reload>(),
      mock<Logout>(),
    )

    const res = await request(app.server).get('/version')

    expect(res.status).toBe(200)
    expect(res.body).toEqual(status)
    expect(getVersion).toHaveBeenCalledTimes(1)
    getVersion.mockRestore()
  })
})
