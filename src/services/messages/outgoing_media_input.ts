import { randomUUID } from 'crypto'
import { BASE_URL, DATA_URL_TTL, UNOAPI_MEDIA_BASE64_MAX_BYTES } from '../../defaults'
import type { getConfig } from '../config'
import { SendError } from '../send_error'

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker'])
const DATA_URI = /^data:([^;,]+);base64,([\s\S]*)$/i

export const UNOAPI_MEDIA_STORAGE_KEY = '__unoapi_media_storage_key'
export const UNOAPI_MEDIA_SOURCE = '__unoapi_media_source'
export const UNOAPI_MEDIA_PUBLIC_URL = '__unoapi_media_public_url'
export const UNOAPI_MESSAGE_ID = '__unoapi_message_id'

const normalizedBase64 = (value: string) => value.replace(/\s+/g, '')

const decodeStrictBase64 = (value: string): Buffer => {
  const compact = normalizedBase64(value)
  if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new SendError(400, 'invalid_media_base64')
  }
  const bytes = Buffer.from(compact, 'base64')
  const canonicalInput = compact.replace(/=+$/, '')
  const canonicalOutput = bytes.toString('base64').replace(/=+$/, '')
  if (!bytes.length || canonicalInput !== canonicalOutput) throw new SendError(400, 'invalid_media_base64')
  return bytes
}

const assertMimeType = (type: string, mimeType: string) => {
  const mime = mimeType.toLowerCase().split(';')[0].trim()
  if (!mime || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime)) {
    throw new SendError(400, 'media_base64_mime_type_required')
  }
  if (type === 'image' && !['image/jpeg', 'image/png'].includes(mime)) {
    throw new SendError(400, `invalid_image_mime_type: ${mime}`)
  }
  if (type === 'audio' && !mime.startsWith('audio/')) {
    throw new SendError(400, `invalid_audio_mime_type: ${mime}`)
  }
  if (type === 'video' && !mime.startsWith('video/')) {
    throw new SendError(400, `invalid_video_mime_type: ${mime}`)
  }
  if (type === 'sticker' && mime !== 'image/webp') {
    throw new SendError(400, `invalid_sticker_mime_type: ${mime}`)
  }
  return mime
}

export type PreparedOutgoingMedia = {
  payload: any
  messageId?: string
}

export const prepareOutgoingMediaInput = async (
  phone: string,
  originalPayload: any,
  getConfig: getConfig,
): Promise<PreparedOutgoingMedia> => {
  const type = `${originalPayload?.type || ''}`
  if (!MEDIA_TYPES.has(type)) return { payload: originalPayload }
  const originalMedia = originalPayload?.[type]
  if (!originalMedia || typeof originalMedia !== 'object' || typeof originalMedia.base64 === 'undefined') {
    return { payload: originalPayload }
  }
  if (typeof originalMedia.base64 !== 'string') throw new SendError(400, 'invalid_media_base64')
  if (`${originalMedia.link || ''}`.trim() || `${originalMedia.id || ''}`.trim()) {
    throw new SendError(400, 'media_source_must_use_only_one_of_link_id_or_base64')
  }

  const dataUri = originalMedia.base64.match(DATA_URI)
  const explicitMime = `${originalMedia.mime_type || originalMedia.mimetype || ''}`.trim()
  const dataUriMime = `${dataUri?.[1] || ''}`.trim()
  if (explicitMime && dataUriMime && explicitMime.toLowerCase().split(';')[0] !== dataUriMime.toLowerCase()) {
    throw new SendError(400, 'media_base64_mime_type_mismatch')
  }
  const mimeType = assertMimeType(type, explicitMime || dataUriMime)
  const bytes = decodeStrictBase64(dataUri ? dataUri[2] : originalMedia.base64)
  if (bytes.length > UNOAPI_MEDIA_BASE64_MAX_BYTES) {
    throw new SendError(400, `media_base64_too_large: ${bytes.length} > ${UNOAPI_MEDIA_BASE64_MAX_BYTES}`)
  }

  const config = await getConfig(phone)
  const { mediaStore } = await config.getStore(phone, config)
  const messageId = randomUUID()
  const storageKey = mediaStore.getFilePath(phone, messageId, mimeType, originalMedia.filename)
  await mediaStore.saveMediaBuffer(storageKey, bytes, mimeType)
  const link = await mediaStore.getFileUrl(storageKey, DATA_URL_TTL)
  const publicUrl = mediaStore.type === 'file'
    ? await mediaStore.getDownloadUrl(BASE_URL, storageKey)
    : link
  const media = {
    ...originalMedia,
    link,
    mime_type: mimeType,
    [UNOAPI_MEDIA_STORAGE_KEY]: storageKey,
    [UNOAPI_MEDIA_SOURCE]: 'base64',
    [UNOAPI_MEDIA_PUBLIC_URL]: publicUrl,
  }
  delete media.base64
  delete media.mimetype

  return {
    messageId,
    payload: {
      ...originalPayload,
      [type]: media,
      [UNOAPI_MESSAGE_ID]: messageId,
    },
  }
}

export const outgoingMediaLogSummary = (payload: any) => {
  const type = `${payload?.type || ''}`
  const media = MEDIA_TYPES.has(type) ? payload?.[type] : undefined
  const base64 = typeof media?.base64 === 'string' ? media.base64 : ''
  return {
    type,
    to: `${payload?.to || ''}`,
    has_media: !!media,
    media_source: base64 ? 'base64' : (`${media?.id || ''}`.trim() ? 'id' : (`${media?.link || ''}`.trim() ? 'link' : undefined)),
    ...(base64 ? { base64_characters: base64.length } : {}),
  }
}
