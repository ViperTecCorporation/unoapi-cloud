import { Contact } from '@whiskeysockets/baileys'
import { jidToPhoneNumberIfUser, toBuffer, ensurePn, phoneNumberToJid } from './transformer'
import { UNOAPI_QUEUE_MEDIA, DATA_TTL, FETCH_TIMEOUT_MS, DATA_URL_TTL, UNOAPI_EXCHANGE_BROKER_NAME, DOWNLOAD_AUDIO_CONVERT_TO_MP3 } from '../defaults'
import { convertBufferToMp3 } from '../utils/audio_convert_mp3'
import { mediaStores, MediaStore, getMediaStore } from './media_store'
import { getDataStore } from './data_store'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { amqpPublish } from '../amqp'
import type { Readable } from 'stream'
import { STORAGE_OPTIONS } from '../defaults'
import { mediaStoreFile } from './media_store_file'
import { Config } from './config'
import logger from './logger'
import fetch, { Response as FetchResponse } from 'node-fetch'


export const getMediaStoreS3: getMediaStore = (phone: string, config: Config, getDataStore: getDataStore): MediaStore => {
  if (!mediaStores.has(phone)) {
    logger.debug('Creating s3 data store %s', phone)
    const store = mediaStoreS3(phone, config, getDataStore)
    mediaStores.set(phone, store)
  } else {
    logger.debug('Retrieving s3 data store %s', phone)
  }
  return mediaStores.get(phone) as MediaStore
}

export const mediaStoreS3 = (phone: string, config: Config, getDataStore: getDataStore): MediaStore => {
  const PROFILE_PICTURE_FOLDER = 'profile-pictures'
  const profilePictureFileName = (phone) => `${phone}.jpg`
  const s3Config = STORAGE_OPTIONS((config as any).storage)
  const bucket = s3Config.bucket
  const s3Client = new S3Client(s3Config)

  const mediaStore = mediaStoreFile(phone, config, getDataStore)
  mediaStore.type = 's3'

  mediaStore.saveMediaBuffer = async (fileName: string, content: Buffer) => {
    logger.debug(`Uploading file ${fileName} to bucket ${bucket}....`)
    try {
      if (DOWNLOAD_AUDIO_CONVERT_TO_MP3 && fileName.toLowerCase().endsWith('.mp3')) {
        // Safety guard: if key is .mp3 but content is OGG/Opus, convert buffer to mp3
        const isOgg = content.length > 4 && content[0] === 0x4f && content[1] === 0x67 && content[2] === 0x67 && content[3] === 0x53 // 'OggS'
        if (isOgg) {
          logger.debug('S3 guard: converting OGG content to MP3 for key %s', fileName)
          content = await convertBufferToMp3(content)
        }
      }
    } catch (e) {
      logger.warn(e as any, 'S3 guard: failed to convert audio to MP3; uploading original for %s', fileName)
    }
    const putParams = {
      Bucket: bucket,
      Key: fileName,
      Body: content,
    }
    const abortSignal = AbortSignal.timeout(s3Config.timeoutMs)
    await s3Client.send(new PutObjectCommand(putParams), { abortSignal })
    logger.debug(`Uploaded file ${fileName} to bucket ${bucket}!`)
    await amqpPublish(
      UNOAPI_EXCHANGE_BROKER_NAME,
      UNOAPI_QUEUE_MEDIA,
      phone,
      { fileName: fileName },
      { delay: DATA_TTL * 1000, type: 'topic' }
    )
    return true
  }

  mediaStore.getFileUrl = async (fileName: string, expiresIn = DATA_URL_TTL) => {
    const getParams = {
      Bucket: bucket,
      Key: fileName,
    }
    const command = new GetObjectCommand(getParams)
    try {
      const link = await getSignedUrl(s3Client, command, { expiresIn })
      return link
    } catch (error) {
      logger.error(
        `Error on generate s3 signed url for bucket: ${bucket} file name: ${fileName} expires in: ${expiresIn} -> ${error.message}`
      )
      throw error
    }
  }

  mediaStore.removeMedia = async (fileName: string) => {
    const putParams = {
      Bucket: bucket,
      Key: fileName,
    }
    await s3Client.send(new DeleteObjectCommand(putParams))
  }

  mediaStore.downloadMediaStream = async (file: string) => {
    const params = {
      Bucket: bucket,
      Key: file,
    }
    logger.debug(`Downloading media ${file}...`)
    const response = await s3Client.send(new GetObjectCommand(params))
    logger.debug(`Downloaded media ${file}!`)
    return response.Body as Readable
  }
 
  mediaStore.getProfilePictureUrl = async (_baseUrl: string, jid: string) => {
    // Nome do arquivo deve ser o número (PN). Se não houver, tenta mapear via PN<->LID.
    let canonical = ensurePn(jid)
    if (!canonical && (jid || '').includes('@lid')) {
      try {
        const ds = await getDataStore(phone, config)
        const pn = await (ds as any).getPnForLid?.(phone, jid)
        canonical = ensurePn(pn)
      } catch {}
    }
    const id = canonical || jid
    logger.debug('S3 profile picture path canonical id: %s (from %s)', id, jid)
    const fileName = `${phone}/${PROFILE_PICTURE_FOLDER}/${profilePictureFileName(id)}`
    try {
      return mediaStore.getFileUrl(fileName, DATA_URL_TTL)
    } catch (error) {
      if (error.name === 'NotFound' || error.code === 'NotFound') {
        return ''
      } else {
        throw error
      }
    }
  }

  mediaStore.saveProfilePicture = async (contact: Partial<Contact>) => {
    const originalId = contact.id as string
    const variants = new Set<string>()
    try {
      const pn = ensurePn(originalId)
      if (pn) variants.add(pn)
      if ((originalId || '').includes('@lid')) {
        variants.add(originalId)
      } else if (pn) {
        try {
          const ds = await getDataStore(phone, config)
          const lid = await (ds as any).getLidForPn?.(phone, phoneNumberToJid(pn))
          if (lid) variants.add(lid)
        } catch {}
      }
    } catch {}
    if (variants.size === 0 && originalId) variants.add(originalId)

    if (['changed', 'removed'].includes(contact.imgUrl || '')) {
      for (const id of variants) {
        const fileName = `${phone}/${PROFILE_PICTURE_FOLDER}/${profilePictureFileName(id)}`
        logger.debug('Removing profile picture s3 %s...', jidToPhoneNumberIfUser(id))
        try { await mediaStore.removeMedia(fileName) } catch {}
      }
      return
    }
    if (contact.imgUrl) {
      logger.debug('Saving profile picture s3 variants %s...', Array.from(variants).join(', '))
      const response: FetchResponse = await fetch(contact.imgUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), method: 'GET'})
      const buffer = toBuffer(await response.arrayBuffer())
      for (const id of variants) {
        const fileName = `${phone}/${PROFILE_PICTURE_FOLDER}/${profilePictureFileName(id)}`
        try {
          await mediaStore.saveMediaBuffer(fileName, buffer)
          logger.debug('Saved profile picture s3 %s!', jidToPhoneNumberIfUser(id))
        } catch (e) {
          logger.warn(e as any, 'Ignore error saving S3 profile picture variant %s', id)
        }
      }
    }
  }

  return mediaStore
}
