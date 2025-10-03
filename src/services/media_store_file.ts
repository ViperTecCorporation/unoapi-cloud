import { proto, WAMessage, downloadMediaMessage, downloadContentFromMessage, Contact } from '@whiskeysockets/baileys'
import { getBinMessage, jidToPhoneNumberIfUser, toBuffer } from './transformer'
import { writeFile } from 'fs/promises'
import { existsSync, mkdirSync, rmSync, createReadStream } from 'fs'
import { MediaStore, getMediaStore, mediaStores } from './media_store'
import mime from 'mime-types'
import { Response } from 'express'
import { getDataStore } from './data_store'
import { Config } from './config'
import logger from './logger'
import { DATA_URL_TTL, FETCH_TIMEOUT_MS } from '../defaults'
import fetch, { Response as FetchResponse } from 'node-fetch'
import mediaToBuffer from '../utils/media_to_buffer'

export const MEDIA_DIR = '/medias'

export const getMediaStoreFile: getMediaStore = (phone: string, config: Config, getDataStore: getDataStore): MediaStore => {
  if (!mediaStores.has(phone)) {
    logger.debug('Creating media store file %s', phone)
    const store = mediaStoreFile(phone, config, getDataStore)
    mediaStores.set(phone, store)
  } else {
    logger.debug('Retrieving media store file %s', phone)
  }
  return mediaStores.get(phone) as MediaStore
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mediaStoreFile = (phone: string, config: Config, getDataStore: getDataStore): MediaStore => {
  const PROFILE_PICTURE_FOLDER = 'profile-pictures'
  const profilePictureFileName = (phone) => `${phone}.jpg`

  const mediaStore: MediaStore = {} as MediaStore
  mediaStore.type = 'file'

  mediaStore.getFilePath = (phone: string, mediaId: string, mimeType: string) => {
    const extension = mime.extension(mimeType)
    return `${phone}/${mediaId}.${extension}`
  }

  mediaStore.saveMediaForwarder = async (message: any) => {
    const filePath = mediaStore.getFilePath(phone, message.id, message[message.type].mime_type)
    const url = `${config.webhookForward.url}/${config.webhookForward.version}/${message[message.type].id}`
    const { buffer } = await mediaToBuffer(url, config.webhookForward.token!, config.webhookForward?.timeoutMs || 0)
    logger.debug('Saving buffer %s...', filePath)
    await mediaStore.saveMediaBuffer(filePath, buffer)
    logger.debug('Saved buffer %s!', filePath)
    const mediaId = `${phone}/${message.id}`
    // "type"=>"audio", "audio"=>{"mime_type"=>"audio/ogg; codecs=opus", "sha256"=>"HgQo1XoLPSCGlIQYu7eukl4ty1yIu2kAWvoKgqLCnu4=", "id"=>"642476532090165", "voice"=>true}}]
    const payload = {
      messaging_product: 'whatsapp',
      mime_type: message[message.type].mime_type,
      sha256: message[message.type].sha256,
      // file_size: binMessage?.message?.fileLength,
      id: mediaId,
      filename: message[message.type].filename || filePath,
    }
    const dataStore = await getDataStore(phone, config)
    await dataStore.setMediaPayload(message.id, payload)
    message[message.type].id = mediaId
    return message
  }

  mediaStore.getFileUrl = async (fileName: string, _expiresIn = DATA_URL_TTL) => {
    return `${config.baseStore}${MEDIA_DIR}/${fileName}`
  }

  mediaStore.getDownloadUrl = async (baseUrl: string, filePath: string) => {
    return `${baseUrl}/v15.0/download/${filePath}`
  }

  const mapMediaType = {
    imageMessage: 'image',
    videoMessage: 'video',
    documentMessage: 'document',
    stickerMessage: 'sticker',
    audioMessage: 'audio',
    ptvMessage: 'video',
  }

  mediaStore.saveMedia = async (waMessage: WAMessage) => {
    let buffer
    const initial = getBinMessage(waMessage)
    const candidates: any[] = []
    const normalizeMk = (m: any) => {
      try {
        const mk = (m as any)?.message?.mediaKey
        if (mk && !(mk instanceof Uint8Array)) {
          if (typeof mk === 'string') {
            ;(m as any).message.mediaKey = Uint8Array.from(Buffer.from(mk, 'base64'))
          } else if (typeof mk === 'object') {
            // handle Node Buffer JSON ({ type: 'Buffer', data: number[] })
            if ((mk as any)?.type === 'Buffer' && Array.isArray((mk as any)?.data)) {
              ;(m as any).message.mediaKey = Uint8Array.from(((mk as any).data as number[]))
            } else {
              // handles {0:..,1:..} and other array-like shapes
              const vals = Object.values(mk as any).filter((x) => typeof x === 'number') as number[]
              if (vals.length) {
                ;(m as any).message.mediaKey = Uint8Array.from(vals)
              }
            }
          }
        }
      } catch {}
    }
    let binMessage = initial
    normalizeMk(binMessage)
    const ensureBestFromPersisted = async () => {
      try {
        const ds = await getDataStore(phone, config)
        const persistedM = await ds.loadMessage(waMessage.key.remoteJid!, waMessage.key.id!)
        if (persistedM) {
          const persistedBin = getBinMessage(persistedM)
          normalizeMk(persistedBin)
          const persistedMk: any = persistedBin?.message?.mediaKey
          const currentMk: any = binMessage?.message?.mediaKey
          const len = (v: any) => (v instanceof Uint8Array ? v.length : ((v?.type === 'Buffer' && Array.isArray(v?.data)) ? v.data.length : (v && Object.keys(v).length) || 0))
          if (len(persistedMk) > len(currentMk)) {
            binMessage = persistedBin
          } else if (persistedMk && currentMk) {
            try {
              const a = persistedMk instanceof Uint8Array ? persistedMk : Uint8Array.from((persistedMk?.data || Object.values(persistedMk || {})) as number[])
              const b = currentMk instanceof Uint8Array ? currentMk : Uint8Array.from((currentMk?.data || Object.values(currentMk || {})) as number[])
              if (a && b && Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) {
                candidates.push(persistedBin)
              }
            } catch {}
          }
          if (binMessage?.message && persistedBin?.message) {
            binMessage.message.fileEncSha256 = binMessage.message.fileEncSha256 || persistedBin.message.fileEncSha256
            binMessage.message.fileSha256 = binMessage.message.fileSha256 || persistedBin.message.fileSha256
            binMessage.message.mediaKeyTimestamp = binMessage.message.mediaKeyTimestamp || persistedBin.message.mediaKeyTimestamp
            binMessage.message.streamingSidecar = binMessage.message.streamingSidecar || persistedBin.message.streamingSidecar
          }
        }
      } catch {}
    }
    await ensureBestFromPersisted()

    // If mediaKey is missing/too short, wait briefly for media-retry to update store
    const keyLen = (mk: any) => (mk instanceof Uint8Array ? mk.length : ((mk?.type === 'Buffer' && Array.isArray(mk?.data)) ? mk.data.length : (mk && Object.keys(mk).length) || 0))
    let attempts = 0
    while ((keyLen(binMessage?.message?.mediaKey) < 32) && attempts < 6) {
      await new Promise((r) => setTimeout(r, 1000))
      await ensureBestFromPersisted()
      attempts++
    }
    const tryDownload = async (ctx: any) => {
      const mediaUrl = ctx?.message?.url || initial?.message?.url
      if (!ctx || !ctx.message || !mediaUrl) {
        throw new Error('Missing media context to download media')
      }
      if (mediaUrl.indexOf('base64') >= 0) {
        const base64 = mediaUrl.split(',')[1]
        return Buffer.from(base64, 'base64')
      }
      const content: any = {
        mediaKey: ctx?.message?.mediaKey,
        directPath: ctx?.message?.directPath,
        url: `https://mmg.whatsapp.net${ctx?.message?.directPath}`,
        fileEncSha256: ctx?.message?.fileEncSha256,
        fileSha256: ctx?.message?.fileSha256,
        mediaKeyTimestamp: ctx?.message?.mediaKeyTimestamp,
        mimetype: ctx?.message?.mimetype,
        streamingSidecar: ctx?.message?.streamingSidecar,
      }
      // primary: use directPath decrypt stream
      const downloadViaContent = async (firstBlockIsIV = false) => {
        const media = await (downloadContentFromMessage as any)(
          content,
          mapMediaType[ctx?.messageType],
          {},
          undefined,
          undefined,
          undefined,
          undefined,
          firstBlockIsIV
        )
        const chunks: any[] = []
        for await (const chunk of media) {
          chunks.push(chunk)
        }
        return Buffer.concat(chunks)
      }
      try {
        return await downloadViaContent(false)
      } catch (err1: any) {
        const msg1 = `${err1?.message || err1}`.toLowerCase()
        if (msg1.includes('bad decrypt')) {
          try {
            logger.warn('Retry download media toggling firstBlockIsIV = true')
            return await downloadViaContent(true)
          } catch (err2: any) {
            // final fallback: use downloadMediaMessage helper
            const toDownloadMessage = { key: waMessage.key, message: { [ctx?.messageType!]: ctx?.message }} as WAMessage
            return await downloadMediaMessage(toDownloadMessage, 'buffer', {})
          }
        }
        // non-decrypt errors: fallback to Baileys helper
        const toDownloadMessage = { key: waMessage.key, message: { [ctx?.messageType!]: ctx?.message }} as WAMessage
        return await downloadMediaMessage(toDownloadMessage, 'buffer', {})
      }
    }
    try {
      buffer = await tryDownload(binMessage)
    } catch (e: any) {
      const msg = `${e?.message || e}`.toLowerCase()
      const ossl = `${e?.code || ''}`.toLowerCase()
      const isBadDecrypt = msg.includes('bad decrypt') || ossl.includes('ossl')
      if (isBadDecrypt && candidates.length) {
        try {
          buffer = await tryDownload(candidates[0])
        } catch (e2) {
          throw e2
        }
      } else {
        throw e
      }
    }
    const filePath = mediaStore.getFilePath(phone, waMessage.key.id!, binMessage?.message?.mimetype)
    logger.debug('Saving buffer %s...', filePath)
    await mediaStore.saveMediaBuffer(filePath, buffer)
    logger.debug('Saved buffer %s!', filePath)
    const mediaId = waMessage.key.id
    const mimeType = mime.lookup(filePath)
    const payload = {
      messaging_product: 'whatsapp',
      mime_type: mimeType,
      sha256: binMessage?.message?.fileSha256,
      file_size: binMessage?.message?.fileLength,
      id: `${phone}/${mediaId}`,
      filename: binMessage?.message?.fileName || filePath,
    }
    const dataStore = await getDataStore(phone, config)
    await dataStore.setMediaPayload(mediaId!, payload)
    return waMessage
  }

  mediaStore.saveMediaBuffer = async (fileName: string, content: Buffer) => {
    const filePath = await mediaStore.getFileUrl(fileName, DATA_URL_TTL)
    const parts = filePath.split('/')
    const dir: string = parts.splice(0, parts.length - 1).join('/')
    if (!existsSync(dir)) {
      mkdirSync(dir)
    }
    await writeFile(filePath, content)
    return true
  }

  mediaStore.removeMedia = async (fileName: string) => {
    const filePath = await mediaStore.getFileUrl(fileName, DATA_URL_TTL)
    return rmSync(filePath)
  }

  mediaStore.downloadMedia = async (res: Response, file: string) => {
    const stream = await mediaStore.downloadMediaStream(file)
    if (!stream) {
      logger.error('Not retrieve the media: %', file)
      res.sendStatus(404)
      return
    }
    const withoutExtension = file.replace(/\.[^/.]+$/, '')
    const mediaId = withoutExtension.split('/')[1]
    if (mediaId) {
      const dataStore = await getDataStore(phone, config)
      const mediaPayload = await dataStore.loadMediaPayload(mediaId!)
      if (mediaPayload?.filename) {
        res.setHeader('Content-disposition', `attachment; filename="${encodeURIComponent(mediaPayload.filename)}"`)
      }
      if (mediaPayload?.content_type) {
        res.contentType(mediaPayload.content_type)
      }
    }
    stream.pipe(res)
  }

  mediaStore.downloadMediaStream = async (file: string) => {
    const filePath = await mediaStore.getFileUrl(file, DATA_URL_TTL)
    return createReadStream(filePath)
  }

  mediaStore.getMedia = async (baseUrl: string, mediaId: string) => {
    const dataStore = await getDataStore(phone, config)
    const mediaPayload = await dataStore.loadMediaPayload(mediaId!)
    const filePath = mediaStore.getFilePath(phone, mediaId!, mediaPayload.mime_type!)
    const url = await mediaStore.getDownloadUrl(baseUrl, filePath)
    const payload = {
      ...mediaPayload,
      url,
    }
    return payload
  }

  mediaStore.getProfilePictureUrl = async (baseUrl: string, jid: string) => {
    const phoneNumber = jidToPhoneNumberIfUser(jid)
    const base = await mediaStore.getFileUrl(PROFILE_PICTURE_FOLDER, DATA_URL_TTL)
    const fName = profilePictureFileName(phoneNumber)
    const complete = `${base}/${fName}`
    return existsSync(complete) ? `${baseUrl}/v15.0/download/${phone}/${PROFILE_PICTURE_FOLDER}/${fName}` : undefined
  }

  mediaStore.saveProfilePicture = async (contact: Contact) => {
    const phoneNumber = jidToPhoneNumberIfUser(contact.id)
    const fName = profilePictureFileName(contact.id)
    if (['changed', 'removed'].includes(contact.imgUrl || '')) {
      logger.debug('Removing profile picture file %s...', phoneNumber)
      await mediaStore.removeMedia(`${PROFILE_PICTURE_FOLDER}/${fName}`)
    } else if (contact.imgUrl) {
      const base = await mediaStore.getFileUrl(PROFILE_PICTURE_FOLDER, DATA_URL_TTL)
      const complete = `${base}/${fName}`
      logger.debug('Saving profile picture file %s....', phoneNumber)
      if (!existsSync(base)) {
        mkdirSync(base, { recursive: true })
      }
      const response: FetchResponse = await fetch(contact.imgUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), method: 'GET'})
      const buffer = toBuffer(await response.arrayBuffer())
      await writeFile(complete, buffer)
      logger.debug('Saved profile picture file %s!!', phoneNumber)
    }
  }

  return mediaStore
}
