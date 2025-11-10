import { Contact } from '@whiskeysockets/baileys'
import { jidToPhoneNumberIfUser, toBuffer, ensurePn, phoneNumberToJid } from './transformer'
import { UNOAPI_QUEUE_MEDIA, DATA_TTL, FETCH_TIMEOUT_MS, DATA_URL_TTL, UNOAPI_EXCHANGE_BROKER_NAME, DOWNLOAD_AUDIO_CONVERT_TO_MP3 } from '../defaults'
import { convertBufferToMp3 } from '../utils/audio_convert_mp3'
import { mediaStores, MediaStore, getMediaStore } from './media_store'
import { getDataStore } from './data_store'
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client, GetObjectCommandOutput } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
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
  const s3Client = new S3Client({
    ...s3Config,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: s3Config.timeoutMs,
      socketTimeout: s3Config.timeoutMs,
    }),
    maxAttempts: s3Config.maxAttempts || 3,
  })

  const mediaStore = mediaStoreFile(phone, config, getDataStore)
  mediaStore.type = 's3'

  // helper: send with single retry on AbortError
  const sendWithRetry = async <T>(command: any, abortMs: number): Promise<T> => {
    const attempt = async () => {
      const abortSignal = AbortSignal.timeout(abortMs)
      // @ts-ignore
      return s3Client.send(command, { abortSignal }) as Promise<T>
    }
    try {
      return await attempt()
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        try { logger.warn(e as any, 'S3 send aborted; retrying once') } catch {}
        await new Promise((r) => setTimeout(r, 800))
        return await attempt()
      }
      throw e
    }
  }

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
    await sendWithRetry(new PutObjectCommand(putParams), s3Config.timeoutMs)
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
    } catch (error: any) {
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
    await sendWithRetry(new DeleteObjectCommand(putParams), s3Config.timeoutMs)
  }

  mediaStore.downloadMediaStream = async (file: string) => {
    const params = {
      Bucket: bucket,
      Key: file,
    }
    logger.debug(`Downloading media ${file}...`)
    const response: GetObjectCommandOutput = await sendWithRetry<GetObjectCommandOutput>(new GetObjectCommand(params), s3Config.timeoutMs)
    logger.debug(`Downloaded media ${file}!`)
    return response.Body as Readable
  }
 
  mediaStore.getProfilePictureUrl = async (_baseUrl: string, jid: string) => {
    const sanitizeId = (input: string): string => {
      try {
        let s = `${input || ''}`
        if (!s) return s
        if (s.includes('@lid@s.whatsapp.net')) s = s.replace('@lid@s.whatsapp.net', '@lid')
        const pn = ensurePn(s)
        if (pn) return pn
        return s
      } catch { return input }
    }
    // Nome do arquivo deve ser o número (PN). Se não houver, tenta mapear via PN<->LID.
    let canonical = ensurePn(jid)
    if (!canonical && (jid || '').includes('@lid')) {
      try {
        const ds = await getDataStore(phone, config)
        const pn = await (ds as any).getPnForLid?.(phone, jid)
        canonical = ensurePn(pn)
      } catch {}
    }
    const id = sanitizeId(canonical || jid)
    logger.debug('S3 profile picture path canonical id: %s (from %s)', id, sanitizeId(jid))
    const fileName = `${phone}/${PROFILE_PICTURE_FOLDER}/${profilePictureFileName(id)}`
    // Verifica existência antes de gerar URL assinada (GetSignedUrl não valida existência)
    try {
      await sendWithRetry(new HeadObjectCommand({ Bucket: bucket, Key: fileName }), s3Config.timeoutMs)
    } catch (error: any) {
      if ((error?.$metadata?.httpStatusCode === 404) || error?.name === 'NotFound' || error?.code === 'NotFound' || error?.Code === 'NotFound') {
        logger.debug('PROFILE_PICTURE S3 not found: %s', fileName)
        return ''
      }
      throw error
    }
    try {
      const url = await mediaStore.getFileUrl(fileName, DATA_URL_TTL)
      logger.debug('PROFILE_PICTURE S3 presigned URL: %s', url)
      return url
    } catch (error: any) {
      logger.warn(error as any, 'Failed to presign S3 URL for %s', fileName)
      return ''
    }
  }

  mediaStore.saveProfilePicture = async (contact: Partial<Contact>) => {
    const sanitizeId = (input: string): string => {
      try {
        let s = `${input || ''}`
        if (!s) return s
        if (s.includes('@lid@s.whatsapp.net')) s = s.replace('@lid@s.whatsapp.net', '@lid')
        const pn = ensurePn(s)
        if (pn) return pn
        return s
      } catch { return input }
    }
    const originalId = contact.id as string
    let canonicalPn = ensurePn(originalId)
    if (!canonicalPn && (originalId || '').includes('@lid')) {
      try {
        const ds = await getDataStore(phone, config)
        const pnJid = await (ds as any).getPnForLid?.(phone, originalId)
        canonicalPn = ensurePn(pnJid)
      } catch {}
    }
    const targetId = sanitizeId(canonicalPn || originalId)

    if (['changed', 'removed'].includes(contact.imgUrl || '')) {
      const fileName = `${phone}/${PROFILE_PICTURE_FOLDER}/${profilePictureFileName(targetId)}`
      try { await mediaStore.removeMedia(fileName) } catch {}
      return
    }
    if (contact.imgUrl) {
      logger.info('PROFILE_PICTURE saving (S3) target: %s (from %s)', targetId, sanitizeId(originalId))
      const response: FetchResponse = await fetch(contact.imgUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), method: 'GET'})
      const buffer = toBuffer(await response.arrayBuffer())
      const fileName = `${phone}/${PROFILE_PICTURE_FOLDER}/${profilePictureFileName(targetId)}`
      try {
        await mediaStore.saveMediaBuffer(fileName, buffer)
        logger.info('PROFILE_PICTURE saved (S3): %s', jidToPhoneNumberIfUser(targetId))
      } catch (e) {
        logger.warn(e as any, 'Ignore error saving S3 profile picture %s', targetId)
      }
    }
  }

  return mediaStore
}
