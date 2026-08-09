import type { MediaStore } from '../../src/services/media_store'
import {
  isEncryptedWhatsAppMediaUrl,
  normalizeInteractiveMediaForWebhook,
} from '../../src/services/messages/interactive_media'

const mediaStore = () => ({
  getFilePath: jest.fn((_phone, mediaId, _mime) => `5566/${mediaId}.jpeg`),
  saveMediaBuffer: jest.fn().mockResolvedValue(true),
  getFileUrl: jest.fn((filePath) => Promise.resolve(`https://s3.example.test/${filePath}`)),
  saveMedia: jest.fn(),
} as unknown as jest.Mocked<MediaStore>)

const carouselMessage = (image: any) => ({
  key: { id: 'carousel-message-1', remoteJid: '5511999999999@s.whatsapp.net', fromMe: false },
  message: {
    interactiveMessage: {
      carouselMessage: {
        cards: [{ header: { imageMessage: image }, body: { text: 'Card' } }],
      },
    },
  },
})

describe('interactive media normalization', () => {
  test('identifies only encrypted WhatsApp CDN links', () => {
    expect(isEncryptedWhatsAppMediaUrl('https://mmg.whatsapp.net/file.enc')).toBe(true)
    expect(isEncryptedWhatsAppMediaUrl('https://cdn.example.test/image.jpg')).toBe(false)
  })

  test('preserves a public original carousel URL without downloading it again', async () => {
    const store = mediaStore()
    const message = carouselMessage({ url: 'https://cdn.example.test/image.jpg', mimetype: 'image/jpeg' })

    await normalizeInteractiveMediaForWebhook('5566', message, store)

    expect(message.message.interactiveMessage.carouselMessage.cards[0].header.imageMessage.url)
      .toBe('https://cdn.example.test/image.jpg')
    expect(store.saveMedia).not.toHaveBeenCalled()
    expect(store.saveMediaBuffer).not.toHaveBeenCalled()
  })

  test('downloads, decrypts and stores recipient carousel media through the provider callback', async () => {
    const store = mediaStore()
    const downloadBytes = jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]))
    const image = {
      url: 'https://mmg.whatsapp.net/file.enc',
      directPath: '/file.enc',
      mediaKey: Uint8Array.from([4, 5, 6]),
      mimetype: 'image/jpeg',
    }
    const message = carouselMessage(image)

    await normalizeInteractiveMediaForWebhook('5566', message, store, { downloadBytes })

    expect(downloadBytes).toHaveBeenCalledWith({ imageMessage: image })
    expect(store.saveMediaBuffer).toHaveBeenCalledWith(
      '5566/carousel-message-1-carousel-0.jpeg',
      Buffer.from([1, 2, 3]),
      'image/jpeg',
    )
    expect(image.url).toBe('https://s3.example.test/5566/carousel-message-1-carousel-0.jpeg')
  })

  test('uses the existing media store downloader for Baileys carousel media', async () => {
    const store = mediaStore()
    const image = {
      url: 'https://mmg.whatsapp.net/file.enc',
      directPath: '/file.enc',
      mediaKey: Uint8Array.from([4, 5, 6]),
      mimetype: 'image/jpeg',
    }
    store.saveMedia.mockImplementation(async (synthetic: any) => {
      synthetic.message.imageMessage.url = 'https://s3.example.test/baileys-card.jpeg'
      return synthetic
    })
    const message = carouselMessage(image)

    await normalizeInteractiveMediaForWebhook('5566', message, store)

    expect(store.saveMedia).toHaveBeenCalledWith(expect.objectContaining({
      key: expect.objectContaining({ id: 'carousel-message-1-carousel-0' }),
      message: { imageMessage: image },
    }))
    expect(image.url).toBe('https://s3.example.test/baileys-card.jpeg')
  })

  test('stores a readable thumbnail when decrypt metadata is unavailable', async () => {
    const store = mediaStore()
    const image = {
      url: 'https://mmg.whatsapp.net/file.enc',
      mimetype: 'image/jpeg',
      jpegThumbnail: Uint8Array.from([7, 8, 9]),
    }
    const message = carouselMessage(image)

    await normalizeInteractiveMediaForWebhook('5566', message, store)

    expect(store.saveMediaBuffer).toHaveBeenCalledWith(
      '5566/carousel-message-1-carousel-0.jpeg',
      Buffer.from([7, 8, 9]),
      'image/jpeg',
    )
    expect(image.url).toBe('https://s3.example.test/5566/carousel-message-1-carousel-0.jpeg')
  })

  test('never forwards an encrypted URL when neither decrypt metadata nor thumbnail exists', async () => {
    const store = mediaStore()
    const image: any = { url: 'https://mmg.whatsapp.net/file.enc', mimetype: 'image/jpeg' }
    const message = carouselMessage(image)

    await normalizeInteractiveMediaForWebhook('5566', message, store)

    expect(image.url).toBeUndefined()
    expect(store.saveMedia).not.toHaveBeenCalled()
    expect(store.saveMediaBuffer).not.toHaveBeenCalled()
  })
})
