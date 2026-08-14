import { DataStore } from '../../src/services/data_store'
import { getDataStore } from '../../src/services/data_store'
import { mock } from 'jest-mock-extended'
import { getMediaStoreFile } from '../../src/services/media_store_file'
import { MediaStore, mediaStores } from '../../src/services/media_store'
import { defaultConfig } from '../../src/services/config'
import fetch from 'node-fetch'
import type { WAMessage } from '@whiskeysockets/baileys'
import { Readable } from 'stream'
import { existsSync } from 'fs'
jest.mock('node-fetch', () => jest.fn())
const phone = `${new Date().getTime()}`
const messageId = `wa.${new Date().getTime()}`
const url = `http://somehost`
const mimetype = 'text/plain'
const extension = 'txt' 

const message = {
  messaging_product: 'whatsapp',
  id: `${phone}/${messageId}`,
  mime_type: mimetype,
  filename: `${messageId}.${extension}`,
  file_size: 12,
  sha256: 'test-sha256',
  url: 'https://storage.example.test/presigned-media',
}
const dataStore = mock<DataStore>()
const fetchMock = fetch as unknown as jest.Mock
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getTestDataStore: getDataStore = async (_phone: string, _config: unknown): Promise<DataStore> => {
  return dataStore
}

describe('media routes', () => {
  let mediaStore: MediaStore

  beforeEach(() => {
    mediaStores.clear()
    dataStore.loadMediaPayload.mockReturnValue(new Promise((resolve) => resolve(message)))
    dataStore.getLidForPn.mockReset()
    dataStore.getPnForLid.mockReset()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    })
    mediaStore = getMediaStoreFile(phone, defaultConfig, getTestDataStore)
  })

  test('getMedia', async () => {
    const filePath = mediaStore.getFilePath(phone, messageId, mimetype, message.filename)
    await mediaStore.saveMediaBuffer(filePath, Buffer.from('proxy-bytes'))
    const response = {
      ...message,
      url: `${url}/v15.0/download/${phone}/${messageId}.${extension}`,
    }
    expect(await mediaStore.getMedia(url, messageId)).toStrictEqual(response)
    await mediaStore.removeMedia(filePath)
  })

  test('falls back to the stored signed URL when the persisted object is unavailable', async () => {
    expect(await mediaStore.getMedia(url, messageId)).toStrictEqual(message)
  })

  test.each([
    ['image/jpeg', 'image.jpg'],
    ['audio/ogg', 'audio.ogg'],
    ['video/mp4', 'video.mp4'],
    ['application/pdf', 'document.pdf'],
  ])('serves exact persisted bytes through the proxy contract for %s', async (mimeType, filename) => {
    const mediaId = `media-${filename}`
    const bytes = Buffer.from(`bytes-${filename}`)
    const filePath = mediaStore.getFilePath(phone, mediaId, mimeType, filename)
    dataStore.loadMediaPayload.mockResolvedValueOnce({
      id: `${phone}/${mediaId}`,
      url: `https://storage.example.test/${filename}?X-Amz-Signature=test`,
      mime_type: mimeType,
      filename,
      file_size: bytes.length,
      sha256: `sha256-${filename}`,
    })
    await mediaStore.saveMediaBuffer(filePath, bytes)

    const payload = await mediaStore.getMedia(url, mediaId) as { url: string }
    expect(payload.url).toBe(`${url}/v15.0/download/${filePath}`)
    const stored = await mediaStore.downloadMediaStream(filePath)
    const chunks: Buffer[] = []
    for await (const chunk of stored!) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(bytes)

    await mediaStore.removeMedia(filePath)
  })

  test('stores outbound preparation sources as streams without buffering them in the caller', async () => {
    const fileName = `${phone}/video-stage-source.bin`
    await mediaStore.saveMediaStream(fileName, Readable.from(Buffer.from('streamed-video')))

    const stored = await mediaStore.downloadMediaStream(fileName)
    const chunks: Buffer[] = []
    for await (const chunk of stored!) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString()).toBe('streamed-video')

    await mediaStore.removeMedia(fileName)
  })

  test('saveProfilePicture mirrors picture by phone and user id', async () => {
    const pn = '556699999999'
    const pnJid = `${pn}@s.whatsapp.net`
    const lid = '123456789012345@lid'
    dataStore.getLidForPn.mockResolvedValue(lid)
    dataStore.getPnForLid.mockResolvedValue(pnJid)

    await mediaStore.saveProfilePicture({ id: pnJid, lid, imgUrl: 'https://example.test/profile.jpg' })

    const pnUrl = await mediaStore.getProfilePictureUrl(url, pnJid)
    const lidUrl = await mediaStore.getProfilePictureUrl(url, lid)

    expect(pnUrl).toContain('5566999999999.jpg')
    expect(lidUrl).toContain(`${lid}.jpg`)

    const picture = await mediaStore.getProfilePictureObject?.(pn)
    expect(picture?.metadata).toEqual(expect.objectContaining({
      content_type: 'image/jpeg',
      content_length: '4',
      etag: expect.any(String),
    }))
    const stream = await picture?.openStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  })

  test('resolves profile picture aliases from LID back to PN', async () => {
    const pn = '556699999999'
    const pnJid = `${pn}@s.whatsapp.net`
    const lid = '123456789012345@lid'
    dataStore.getPnForLid.mockResolvedValue(pnJid)
    dataStore.getLidForPn.mockResolvedValue(lid)

    await mediaStore.saveProfilePicture({ id: pnJid, lid, imgUrl: 'https://example.test/profile.jpg' })

    expect(await mediaStore.getProfilePictureObject?.(lid)).toBeDefined()
  })

  test('stores and retrieves a group profile picture under the session path', async () => {
    const groupId = '120363039221813429@g.us'
    await mediaStore.saveProfilePicture({ id: groupId, imgUrl: 'https://example.test/group.jpg' })

    const picture = await mediaStore.getProfilePictureObject?.(groupId)
    const canonicalPath = await mediaStore.getFileUrl(`${phone}/profile-pictures/${groupId}.jpg`, 60)
    expect(existsSync(canonicalPath)).toBe(true)
    expect(picture).toBeDefined()

    await mediaStore.removeMedia(`${phone}/profile-pictures/${groupId}.jpg`)
  })

  test('migrates a legacy filesystem profile picture to the session-scoped path', async () => {
    const pictureId = '5566999069708'
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    await mediaStore.saveMediaBuffer(`profile-pictures/${pictureId}.jpg`, bytes)

    expect(await mediaStore.getProfilePictureObject?.(pictureId)).toBeDefined()
    const canonicalPath = await mediaStore.getFileUrl(`${phone}/profile-pictures/${pictureId}.jpg`, 60)
    expect(existsSync(canonicalPath)).toBe(true)

    await mediaStore.removeMedia(`${phone}/profile-pictures/${pictureId}.jpg`)
    await mediaStore.removeMedia(`profile-pictures/${pictureId}.jpg`)
  })

  test('persists an already downloaded provider buffer without Baileys decryption', async () => {
    mediaStore.saveMediaBuffer = jest.fn().mockResolvedValue(true)
    const waMessage: WAMessage = {
      key: { id: 'zapo-media-1', remoteJid: '123@lid', fromMe: false },
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          fileName: 'foto.jpg',
          fileLength: 3,
        },
      },
    }

    await mediaStore.saveDownloadedMedia!(waMessage, Buffer.from('img'))

    expect(mediaStore.saveMediaBuffer).toHaveBeenCalledWith(
      expect.stringContaining('zapo-media-1.jpeg'),
      Buffer.from('img'),
    )
    expect(dataStore.setMediaPayload).toHaveBeenCalledWith(
      'zapo-media-1',
      expect.objectContaining({ id: `${phone}/zapo-media-1` }),
    )
    expect(waMessage.message?.imageMessage?.url).toContain('zapo-media-1.jpeg')
  })

  test('replaces the nested PDF URL after storing documentWithCaptionMessage', async () => {
    mediaStore.saveMediaBuffer = jest.fn().mockResolvedValue(true)
    const waMessage: WAMessage = {
      key: { id: 'zapo-pdf-1', remoteJid: '123@lid', fromMe: false },
      message: {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              mimetype: 'application/pdf',
              fileName: 'ofertas.pdf',
              fileLength: 3,
              url: 'https://mmg.whatsapp.net/encrypted',
            },
          },
        },
      },
    }

    await mediaStore.saveDownloadedMedia!(waMessage, Buffer.from('pdf'))

    expect(waMessage.message?.documentWithCaptionMessage?.message?.documentMessage?.url)
      .toContain('zapo-pdf-1.pdf')
    expect(dataStore.setMediaPayload).toHaveBeenCalledWith(
      'zapo-pdf-1',
      expect.objectContaining({
        filename: 'ofertas.pdf',
        id: `${phone}/zapo-pdf-1`,
      }),
    )
  })

  test('does not persist a profile picture when the download fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })

    await expect(mediaStore.saveProfilePicture({
      id: '111@lid',
      imgUrl: 'https://example.test/missing.jpg',
    })).rejects.toThrow('HTTP 404')
  })
})
