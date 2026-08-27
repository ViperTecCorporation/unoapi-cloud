import { Agent } from 'node:http'
import { Readable } from 'node:stream'
import type { Response } from 'node-fetch'
import { proto } from 'zapo-js'
import {
  createYouTubeLinkPreviewResolver,
  createYouTubeLinkPreviewResolverForTransport,
} from '../../src/services/messages/youtube_link_preview'

const response = ({
  body,
  contentType,
  contentLength,
  ok = true,
  status = 200,
  url = '',
}: {
  body?: string | Uint8Array
  contentType: string
  contentLength?: number
  ok?: boolean
  status?: number
  url?: string
}) => ({
  ok,
  status,
  url,
  body: body === undefined ? undefined : Readable.from([body]),
  headers: {
    get: (name: string) => {
      if (name.toLowerCase() === 'content-type') return contentType
      if (name.toLowerCase() === 'content-length' && contentLength !== undefined) return `${contentLength}`
      return null
    },
  },
}) as unknown as Response

describe('YouTube link preview', () => {
  test.each([
    'https://youtube.com/shorts/L-HPPgyJ4SY?feature=share',
    'https://www.youtube.com/watch?v=L-HPPgyJ4SY',
    'https://youtu.be/L-HPPgyJ4SY',
    'https://www.youtube.com/embed/L-HPPgyJ4SY',
  ])('resolves YouTube metadata and JPEG thumbnail through oEmbed: %s', async (url) => {
    const thumbnail = Uint8Array.from([1, 2, 3, 4])
    const fetcher = jest.fn()
      .mockResolvedValueOnce(response({
        body: JSON.stringify({
          title: 'Vídeo de teste',
          author_name: 'Canal de teste',
          thumbnail_url: 'https://i.ytimg.com/vi/L-HPPgyJ4SY/hqdefault.jpg',
          thumbnail_width: 480,
          thumbnail_height: 360,
        }),
        contentType: 'application/json; charset=utf-8',
      }))
      .mockResolvedValueOnce(response({
        body: thumbnail,
        contentType: 'image/jpeg',
        contentLength: thumbnail.length,
        url: 'https://i.ytimg.com/vi/L-HPPgyJ4SY/hqdefault.jpg',
      }))
    const agent = new Agent()
    const resolver = createYouTubeLinkPreviewResolver({ fetch: fetcher, agent })

    await expect(resolver(`Confira ${url}`)).resolves.toEqual({
      matchedText: url,
      title: 'Vídeo de teste',
      description: 'Canal de teste',
      previewType: proto.Message.ExtendedTextMessage.PreviewType.VIDEO,
      thumbnail: {
        bytes: Buffer.from(thumbnail),
        width: 480,
        height: 360,
      },
    })
    expect(fetcher).toHaveBeenNthCalledWith(1,
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=L-HPPgyJ4SY')}`,
      expect.objectContaining({ agent, signal: expect.any(AbortSignal) }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(2,
      'https://i.ytimg.com/vi/L-HPPgyJ4SY/hqdefault.jpg',
      expect.objectContaining({ agent, signal: expect.any(AbortSignal) }),
    )
  })

  test.each([
    'https://example.com/watch?v=L-HPPgyJ4SY',
    'https://youtube.com/shorts/invalido',
    'texto sem link',
  ])('does not intercept unsupported or invalid links: %s', async (text) => {
    const fetcher = jest.fn()
    const resolver = createYouTubeLinkPreviewResolver({ fetch: fetcher })
    await expect(resolver(text)).resolves.toBeUndefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('falls back to the generic Zapo preview when oEmbed is unavailable', async () => {
    const fetcher = jest.fn().mockResolvedValue(response({
      contentType: 'application/json',
      ok: false,
      status: 404,
    }))
    const resolver = createYouTubeLinkPreviewResolver({ fetch: fetcher })
    await expect(resolver('https://youtube.com/shorts/L-HPPgyJ4SY')).resolves.toBeUndefined()
  })

  test('does not download a thumbnail from an untrusted host', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response({
      body: JSON.stringify({
        title: 'Vídeo seguro',
        thumbnail_url: 'https://example.com/untrusted.jpg',
      }),
      contentType: 'application/json',
    }))
    const resolver = createYouTubeLinkPreviewResolver({ fetch: fetcher })

    await expect(resolver('https://youtu.be/L-HPPgyJ4SY')).resolves.toEqual({
      matchedText: 'https://youtu.be/L-HPPgyJ4SY',
      title: 'Vídeo seguro',
      previewType: proto.Message.ExtendedTextMessage.PreviewType.VIDEO,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test('refuses to bypass an unknown link-preview dispatcher', () => {
    expect(createYouTubeLinkPreviewResolverForTransport({ dispatch: jest.fn() })).toBeUndefined()
    expect(createYouTubeLinkPreviewResolverForTransport(new Agent())).toEqual(expect.any(Function))
  })
})
