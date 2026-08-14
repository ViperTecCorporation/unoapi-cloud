import logger from '../logger'
import type { MediaStore } from '../media_store'
import { normalizeMessageContent } from '../transformer/message_type'
import type { WhatsAppMessage } from '../whatsapp_types'

const MEDIA_HEADERS = [
  { property: 'imageMessage', type: 'image', defaultMime: 'image/jpeg' },
  { property: 'videoMessage', type: 'video', defaultMime: 'video/mp4' },
  { property: 'documentMessage', type: 'document', defaultMime: 'application/octet-stream' },
] as const

type InteractiveMediaEntry = {
  media: any
  mediaType: typeof MEDIA_HEADERS[number]
  suffix: string
}

type NormalizeInteractiveMediaOptions = {
  downloadBytes?: (message: Record<string, any>) => Promise<Uint8Array | Buffer>
}

const safeMediaId = (value: unknown) => `${value || 'message'}`.replace(/[^a-zA-Z0-9._-]/g, '_')

export const isEncryptedWhatsAppMediaUrl = (value: unknown) => {
  try {
    const url = new URL(`${value || ''}`)
    return url.hostname.toLowerCase() === 'mmg.whatsapp.net' ||
      url.hostname.toLowerCase().endsWith('.mmg.whatsapp.net')
  } catch {
    return false
  }
}

const mediaFromHeader = (header: any, suffix: string): InteractiveMediaEntry | undefined => {
  for (const mediaType of MEDIA_HEADERS) {
    const media = header?.[mediaType.property]
    if (media) return { media, mediaType, suffix }
  }
  return undefined
}

export const interactiveMediaEntries = (message: WhatsAppMessage): InteractiveMediaEntry[] => {
  const content: any = normalizeMessageContent(message?.message)
  const interactive = content?.interactiveMessage
  if (!interactive) return []

  const entries: InteractiveMediaEntry[] = []
  const header = mediaFromHeader(interactive.header, 'header')
  if (header) entries.push(header)
  for (const [index, card] of (interactive?.carouselMessage?.cards || []).entries()) {
    const cardHeader = mediaFromHeader(card?.header, `carousel-${index}`)
    if (cardHeader) entries.push(cardHeader)
  }
  return entries
}

const thumbnailBuffer = (media: any) => {
  const value = media?.jpegThumbnail || media?.thumbnail
  if (!value) return undefined
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  if (typeof value === 'string') return Buffer.from(value, 'base64')
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data)
  return undefined
}

const saveBuffer = async (
  phone: string,
  messageId: string,
  entry: InteractiveMediaEntry,
  mediaStore: MediaStore,
  buffer: Buffer,
) => {
  const mimeType = `${entry.media?.mimetype || entry.mediaType.defaultMime}`
  const mediaId = `${safeMediaId(messageId)}-${entry.suffix}`
  const filePath = mediaStore.getFilePath(phone, mediaId, mimeType, entry.media?.fileName)
  await mediaStore.saveMediaBuffer(filePath, buffer, mimeType)
  entry.media.url = await mediaStore.getFileUrl(filePath, 60 * 60 * 24 * 7)
}

const saveWithMediaStoreDownloader = async (
  message: WhatsAppMessage,
  entry: InteractiveMediaEntry,
  mediaStore: MediaStore,
) => {
  const syntheticId = `${safeMediaId(message?.key?.id)}-${entry.suffix}`
  const synthetic: WhatsAppMessage = {
    key: { ...(message?.key || {}), id: syntheticId },
    message: { [entry.mediaType.property]: entry.media },
  }
  const saved = await mediaStore.saveMedia(synthetic)
  const savedMedia = saved?.message?.[entry.mediaType.property]
  if (savedMedia?.url) entry.media.url = savedMedia.url
}

export const normalizeInteractiveMediaForWebhook = async (
  phone: string,
  message: WhatsAppMessage,
  mediaStore: MediaStore,
  options: NormalizeInteractiveMediaOptions = {},
) => {
  const entries = interactiveMediaEntries(message)
  for (const entry of entries) {
    const currentUrl = `${entry.media?.url || ''}`
    if (currentUrl && !isEncryptedWhatsAppMediaUrl(currentUrl)) continue

    const canDecrypt = !!entry.media?.mediaKey && !!(entry.media?.directPath || currentUrl)
    let persisted = false
    if (canDecrypt) {
      try {
        if (options.downloadBytes) {
          const bytes = await options.downloadBytes({ [entry.mediaType.property]: entry.media })
          await saveBuffer(phone, `${message?.key?.id || 'message'}`, entry, mediaStore, Buffer.from(bytes))
        } else {
          await saveWithMediaStoreDownloader(message, entry, mediaStore)
        }
        persisted = !!entry.media?.url && !isEncryptedWhatsAppMediaUrl(entry.media.url)
      } catch (error) {
        logger.warn(error as any, 'Failed to persist interactive media id=%s part=%s', message?.key?.id, entry.suffix)
      }
    }

    if (!persisted) {
      const thumbnail = thumbnailBuffer(entry.media)
      if (thumbnail?.length) {
        try {
          await saveBuffer(phone, `${message?.key?.id || 'message'}`, entry, mediaStore, thumbnail)
          persisted = true
          logger.warn('Using interactive media thumbnail id=%s part=%s', message?.key?.id, entry.suffix)
        } catch (error) {
          logger.warn(error as any, 'Failed to persist interactive media thumbnail id=%s part=%s', message?.key?.id, entry.suffix)
        }
      }
    }

    if (!persisted && isEncryptedWhatsAppMediaUrl(entry.media?.url)) {
      delete entry.media.url
      logger.warn('Removed encrypted interactive media URL id=%s part=%s', message?.key?.id, entry.suffix)
    }
  }
  return message
}
