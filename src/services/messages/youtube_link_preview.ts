import type { Agent } from 'node:http'
import fetch, { type RequestInit, type Response } from 'node-fetch'
import { proto, type WaClientProxyOptions, type WaLinkPreviewOverride } from 'zapo-js'
import { findFirstAutomaticPreviewUrl } from './automatic_link_preview'

const OEMBED_URL = 'https://www.youtube.com/oembed'
const REQUEST_TIMEOUT_MS = 3_000
const MAX_OEMBED_BYTES = 32 * 1024
const MAX_THUMBNAIL_BYTES = 256 * 1024
const VIDEO_ID = /^[a-z0-9_-]{11}$/i
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])
const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com'])

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export type YouTubeLinkPreviewResolver = (text: string) => Promise<WaLinkPreviewOverride | undefined>

type YouTubeLinkPreviewResolverOptions = {
  agent?: Agent
  fetch?: Fetch
  timeoutMs?: number
}

type YouTubeOEmbed = {
  title?: unknown
  author_name?: unknown
  thumbnail_url?: unknown
  thumbnail_width?: unknown
  thumbnail_height?: unknown
}

const resolveVideoId = (url: URL) => {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  let candidate = ''
  if (hostname === 'youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0] || ''
  } else if (YOUTUBE_HOSTS.has(hostname)) {
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] === 'watch') candidate = url.searchParams.get('v') || ''
    else if (['shorts', 'embed', 'live'].includes(segments[0] || '')) candidate = segments[1] || ''
  }
  return VIDEO_ID.test(candidate) ? candidate : undefined
}

const positiveInteger = (value: unknown) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

const readCapped = async (response: Response, maxBytes: number) => {
  if (!response.body) return undefined
  const chunks: Buffer[] = []
  let total = 0
  for await (const rawChunk of response.body) {
    const chunk = Buffer.from(rawChunk)
    if (total + chunk.length > maxBytes) {
      ;(response.body as { destroy?: () => void }).destroy?.()
      return undefined
    }
    chunks.push(chunk)
    total += chunk.length
  }
  return Buffer.concat(chunks, total)
}

const withTimeout = async <T>(task: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await task(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

const isAllowedThumbnail = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && YOUTUBE_THUMBNAIL_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

export const createYouTubeLinkPreviewResolver = (
  options: YouTubeLinkPreviewResolverOptions = {},
): YouTubeLinkPreviewResolver => {
  const fetcher = options.fetch || fetch
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS
  const requestInit = options.agent ? { agent: options.agent } : {}

  return async (text) => {
    const matchedText = findFirstAutomaticPreviewUrl(text)
    if (!matchedText) return undefined

    let parsed: URL
    try {
      parsed = new URL(matchedText)
    } catch {
      return undefined
    }
    const videoId = resolveVideoId(parsed)
    if (!videoId) return undefined

    try {
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`
      const oEmbedUrl = `${OEMBED_URL}?format=json&url=${encodeURIComponent(canonicalUrl)}`
      const body = await withTimeout(async (signal) => {
        const response = await fetcher(oEmbedUrl, {
          ...requestInit,
          headers: { accept: 'application/json' },
          signal,
        })
        if (!response.ok || !/^application\/json\b/i.test(response.headers.get('content-type') || '')) return undefined
        return readCapped(response, MAX_OEMBED_BYTES)
      }, timeoutMs)
      if (!body) return undefined
      const metadata = JSON.parse(body.toString('utf8')) as YouTubeOEmbed
      const title = typeof metadata.title === 'string' ? metadata.title.trim() : ''
      if (!title) return undefined

      const thumbnailUrl = typeof metadata.thumbnail_url === 'string' ? metadata.thumbnail_url : ''
      let thumbnail: WaLinkPreviewOverride['thumbnail']
      if (isAllowedThumbnail(thumbnailUrl)) {
        const bytes = await withTimeout(async (signal) => {
          const thumbnailResponse = await fetcher(thumbnailUrl, {
            ...requestInit,
            headers: { accept: 'image/jpeg,image/*;q=0.8' },
            signal,
          })
          const contentType = thumbnailResponse.headers.get('content-type') || ''
          const contentLength = Number(thumbnailResponse.headers.get('content-length') || 0)
          const finalUrlAllowed = isAllowedThumbnail(thumbnailResponse.url || thumbnailUrl)
          if (
            !thumbnailResponse.ok
            || !finalUrlAllowed
            || !/^image\/jpeg\b/i.test(contentType)
            || (contentLength && contentLength > MAX_THUMBNAIL_BYTES)
          ) {
            ;(thumbnailResponse.body as { destroy?: () => void } | null)?.destroy?.()
            return undefined
          }
          return readCapped(thumbnailResponse, MAX_THUMBNAIL_BYTES)
        }, timeoutMs)
        if (bytes?.length) {
          const width = positiveInteger(metadata.thumbnail_width)
          const height = positiveInteger(metadata.thumbnail_height)
          thumbnail = {
            bytes,
            ...(width ? { width } : {}),
            ...(height ? { height } : {}),
          }
        }
      }

      const description = typeof metadata.author_name === 'string' ? metadata.author_name.trim() : ''
      return {
        matchedText,
        title,
        ...(description ? { description } : {}),
        previewType: proto.Message.ExtendedTextMessage.PreviewType.VIDEO,
        ...(thumbnail ? { thumbnail } : {}),
      }
    } catch {
      return undefined
    }
  }
}

const isNodeAgent = (transport: unknown): transport is Agent =>
  typeof transport === 'object'
  && transport !== null
  && 'addRequest' in transport
  && typeof transport.addRequest === 'function'

export const createYouTubeLinkPreviewResolverForTransport = (
  transport?: WaClientProxyOptions['linkPreview'],
) => {
  if (transport && !isNodeAgent(transport)) return undefined
  return createYouTubeLinkPreviewResolver({ agent: transport })
}
