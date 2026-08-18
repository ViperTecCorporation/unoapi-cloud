import request from 'supertest'
import { Readable } from 'stream'
import { mock } from 'jest-mock-extended'

import { App } from '../../src/app'
import { Incoming } from '../../src/services/incoming'
import { Outgoing } from '../../src/services/outgoing'
import { Config, getConfig } from '../../src/services/config'
import { Store } from '../../src/services/store'
import { MediaStore } from '../../src/services/media_store'
import { SessionStore } from '../../src/services/session_store'
import { OnNewLogin } from '../../src/services/socket'
import { addToBlacklist } from '../../src/services/blacklist'
import { Reload } from '../../src/services/reload'
import { Logout } from '../../src/services/logout'
import middleware from '../../src/services/middleware'

describe('authenticated profile picture route', () => {
  const session = '5566999424178'
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01, 0xff, 0xd9])
  const etag = '"profile-etag"'
  let app: App
  let mediaStore: MediaStore

  beforeEach(() => {
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const sessionStore = mock<SessionStore>()
    const onNewLogin = mock<OnNewLogin>()
    const reload = mock<Reload>()
    const logout = mock<Logout>()
    const blacklist = mock<addToBlacklist>()
    const store = mock<Store>()
    const config = mock<Config>()
    config.useRedis = false
    mediaStore = mock<MediaStore>()
    store.mediaStore = mediaStore
    config.getStore = jest.fn().mockResolvedValue(store)
    const getConfigTest: getConfig = async () => config
    const authenticate: middleware = async (req, res, next) => {
      if (req.header('authorization') !== 'TOKEN') {
        res.sendStatus(401)
        return
      }
      next()
    }
    app = new App(incoming, outgoing, 'https://uno.test', getConfigTest, sessionStore, onNewLogin, blacklist, reload, logout, authenticate)
  })

  const pictureObject = () => ({
    metadata: {
      etag,
      last_modified: '2026-08-14T12:00:00.000Z',
      content_length: `${bytes.length}`,
      content_type: 'image/jpeg',
    },
    openStream: jest.fn().mockResolvedValue(Readable.from(bytes)),
  })

  test.each([
    '5566999069708',
    '53515477086263@lid',
    '120363039221813429@g.us',
  ])('streams profile picture bytes for %s', async (pictureId) => {
    mediaStore.getProfilePictureObject = jest.fn().mockResolvedValue(pictureObject())

    const response = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/${encodeURIComponent(pictureId)}`)
      .set('Authorization', 'TOKEN')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })

    expect(response.status).toBe(200)
    expect(response.body).toEqual(bytes)
    expect(response.headers['content-type']).toBe('image/jpeg')
    expect(response.headers['content-length']).toBe(`${bytes.length}`)
    expect(response.headers.etag).toBe(etag)
    expect(response.headers['last-modified']).toBe('Fri, 14 Aug 2026 12:00:00 GMT')
    expect(response.headers['cache-control']).toBe('private, max-age=86400, must-revalidate')
    expect(mediaStore.getProfilePictureObject).toHaveBeenCalledWith(pictureId)
  })

  test('returns 304 without opening the object stream', async () => {
    const picture = pictureObject()
    mediaStore.getProfilePictureObject = jest.fn().mockResolvedValue(picture)

    const response = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')
      .set('If-None-Match', `W/${etag}`)

    expect(response.status).toBe(304)
    expect(picture.openStream).not.toHaveBeenCalled()
  })

  test('returns 401 without authentication', async () => {
    const response = await request(app.server).get(`/v13.0/${session}/profile-pictures/5566999069708`)
    expect(response.status).toBe(401)
  })

  test('returns 404 when the picture does not exist', async () => {
    mediaStore.getProfilePictureObject = jest.fn().mockResolvedValue(undefined)
    const response = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')
    expect(response.status).toBe(404)
  })

  test('caches a missing picture and avoids repeated storage probes', async () => {
    mediaStore.getProfilePictureObject = jest.fn().mockResolvedValue(undefined)

    const first = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')
    const second = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')

    expect(first.status).toBe(404)
    expect(second.status).toBe(404)
    expect(mediaStore.getProfilePictureObject).toHaveBeenCalledTimes(1)
  })

  test('coalesces concurrent storage probes for the same missing picture', async () => {
    let resolveLookup: (value: undefined) => void = () => undefined
    mediaStore.getProfilePictureObject = jest.fn().mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveLookup = resolve
    }))

    const first = request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')
      .then((response) => response)
    const second = request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')
      .then((response) => response)
    for (let attempt = 0; attempt < 20 && !mediaStore.getProfilePictureObject.mock.calls.length; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    expect(mediaStore.getProfilePictureObject).toHaveBeenCalledTimes(1)
    resolveLookup(undefined)

    const [firstResponse, secondResponse] = await Promise.all([first, second])
    expect(firstResponse.status).toBe(404)
    expect(secondResponse.status).toBe(404)
    expect(mediaStore.getProfilePictureObject).toHaveBeenCalledTimes(1)
  })

  test('rejects oversized profile pictures before opening the stream', async () => {
    const picture = pictureObject()
    picture.metadata.content_length = `${10 * 1024 * 1024 + 1}`
    mediaStore.getProfilePictureObject = jest.fn().mockResolvedValue(picture)

    const response = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')

    expect(response.status).toBe(413)
    expect(picture.openStream).not.toHaveBeenCalled()
  })

  test('rejects objects that are not images', async () => {
    const picture = pictureObject()
    picture.metadata.content_type = 'application/octet-stream'
    mediaStore.getProfilePictureObject = jest.fn().mockResolvedValue(picture)

    const response = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/5566999069708`)
      .set('Authorization', 'TOKEN')

    expect(response.status).toBe(415)
    expect(picture.openStream).not.toHaveBeenCalled()
  })

  test.each(['..avatar', 'folder/avatar.jpg', '53515477086263@lid\\avatar'])('rejects unsafe picture id %s', async (pictureId) => {
    const response = await request(app.server)
      .get(`/v13.0/${session}/profile-pictures/${encodeURIComponent(pictureId)}`)
      .set('Authorization', 'TOKEN')
    expect([400, 404]).toContain(response.status)
    expect(mediaStore.getProfilePictureObject).not.toHaveBeenCalled()
  })
})
