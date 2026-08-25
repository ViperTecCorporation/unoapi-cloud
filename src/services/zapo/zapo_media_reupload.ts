import type { WaClient, WaIncomingMessageEvent, WaMediaRetryResultType } from 'zapo-js'
import { resolveMediaPayload } from 'zapo-js'
import logger from '../logger'

type MessageCoordinator = Pick<WaClient['message'], 'downloadBytes' | 'requestMediaReupload'>
type DownloadOptions = Parameters<WaClient['message']['downloadBytes']>[1]

type DownloadSource =
  | {
      key?: WaIncomingMessageEvent['key']
      message?: object | null
    }
  | object

type ZapoMediaDownloadOptions = {
  download?: DownloadOptions
  phone?: string
  retryContext?: { key?: WaIncomingMessageEvent['key'] }
}

const errorStatus = (error: unknown): number | undefined => {
  const value = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown; statusCode?: unknown }
    cause?: { status?: unknown; statusCode?: unknown }
    message?: unknown
  }
  const candidates = [
    value?.status,
    value?.statusCode,
    value?.response?.status,
    value?.response?.statusCode,
    value?.cause?.status,
    value?.cause?.statusCode,
  ]
  for (const candidate of candidates) {
    const status = Number(candidate)
    if (Number.isInteger(status)) return status
  }
  const match = `${value?.message || ''}`.match(/(?:status|http)\s*[:=]?\s*(404|410)\b/i)
  return match ? Number(match[1]) : undefined
}

export const isZapoExpiredMediaError = (error: unknown) => [404, 410].includes(errorStatus(error) || 0)

const sameBytes = (left: unknown, right: unknown) =>
  left instanceof Uint8Array &&
  right instanceof Uint8Array &&
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index])

const replaceMediaPath = (value: unknown, target: { directPath: string; mediaKey: Uint8Array }, directPath: string): unknown => {
  if (!value || typeof value !== 'object' || value instanceof Uint8Array || value instanceof Date) return value
  const candidate = value as { directPath?: unknown; mediaKey?: unknown }
  if (candidate.directPath === target.directPath && sameBytes(candidate.mediaKey, target.mediaKey)) {
    return { ...value, directPath }
  }
  if (Array.isArray(value)) return value.map((entry) => replaceMediaPath(entry, target, directPath))
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceMediaPath(entry, target, directPath)]))
}

const logUnavailable = (phone: string | undefined, messageId: string, result: WaMediaRetryResultType) =>
  logger.warn('ZAPO_MEDIA_REUPLOAD phone=%s id=%s result=%s', phone || '<unknown>', messageId, result)

/**
 * Downloads media and performs WhatsApp's authenticated media-retry round trip
 * once when the CDN reports an expired object (HTTP 404/410).
 */
export const downloadZapoMediaBytes = async (
  coordinator: MessageCoordinator,
  source: DownloadSource,
  options: ZapoMediaDownloadOptions = {},
): Promise<Uint8Array> => {
  try {
    return options.download === undefined
      ? await coordinator.downloadBytes(source as never)
      : await coordinator.downloadBytes(source as never, options.download)
  } catch (error) {
    if (!isZapoExpiredMediaError(error)) throw error

    const event = options.retryContext || (source as { key?: WaIncomingMessageEvent['key']; message?: object | null })
    const key = event.key
    const media = resolveMediaPayload(source as never)
    if (!key?.id || !key.remoteJid || key.isNewsletter || !media?.mediaKey?.byteLength) throw error

    const retry = await coordinator.requestMediaReupload({
      messageId: key.id,
      chatJid: key.remoteJid,
      mediaKey: media.mediaKey,
      fromMe: !!key.fromMe,
      ...(key.participant ? { participant: key.participant } : {}),
    })
    if (retry.result !== 'success' || !retry.directPath) {
      logUnavailable(options.phone, key.id, retry.result)
      throw error
    }

    const patched = replaceMediaPath(source, media, retry.directPath)
    logger.info('ZAPO_MEDIA_REUPLOAD phone=%s id=%s result=success', options.phone || '<unknown>', key.id)
    return options.download === undefined
      ? coordinator.downloadBytes(patched as never)
      : coordinator.downloadBytes(patched as never, options.download)
  }
}
