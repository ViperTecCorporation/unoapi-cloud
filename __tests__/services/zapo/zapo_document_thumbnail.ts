import { Readable } from 'stream'
import type { WaMediaProcessor } from 'zapo-js/media'
import { guardDocumentImageThumbnail, isImagePreviewInput } from '../../../src/services/zapo/zapo_document_thumbnail'

describe('Zapo document thumbnail compatibility', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')

  test('uses content detection to decide whether a document supports image preview', async () => {
    const processor: WaMediaProcessor = {
      detectMimetype: jest.fn(async (input) => Buffer.from(input as Uint8Array).subarray(0, 4).toString() === '%PDF'
        ? 'application/pdf'
        : 'image/jpeg'),
    }
    await expect(isImagePreviewInput(processor, pdf)).resolves.toBe(false)
    await expect(isImagePreviewInput(processor, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).resolves.toBe(true)
  })

  test.each([
    ['PDF', 'application/pdf', pdf],
    ['Office document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK\x03\x04')],
    ['ZIP', 'application/zip', Buffer.from('PK\x03\x04')],
    ['plain text', null, Buffer.from('plain text')],
  ])('sends %s without trying to generate an image preview', async (_name, detectedMimetype, bytes) => {
    const generateImageThumbnail = jest.fn().mockResolvedValue({
      jpegThumbnail: Uint8Array.from([9, 8, 7]),
      width: 32,
      height: 32,
    })
    const detectMimetype = jest.fn().mockResolvedValue(detectedMimetype)
    const processor = guardDocumentImageThumbnail({ generateImageThumbnail, detectMimetype })

    await expect(processor.generateImageThumbnail!(bytes, 32)).resolves.toBeUndefined()
    expect(generateImageThumbnail).not.toHaveBeenCalled()
  })

  test('preserves preview generation for actual image content', async () => {
    const generateImageThumbnail = jest.fn().mockResolvedValue({
      jpegThumbnail: Uint8Array.from([9, 8, 7]),
      width: 32,
      height: 32,
    })
    const detectMimetype = jest.fn().mockResolvedValue('image/jpeg')
    const processor = guardDocumentImageThumbnail({ generateImageThumbnail, detectMimetype })
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
    await expect(processor.generateImageThumbnail!(jpeg, 32)).resolves.toEqual({
      jpegThumbnail: Uint8Array.from([9, 8, 7]),
      width: 32,
      height: 32,
    })
    expect(detectMimetype).toHaveBeenCalledWith(jpeg, undefined)
    expect(generateImageThumbnail).toHaveBeenCalledWith(jpeg, 32, undefined)
  })

  test('preserves video, audio and sticker processors byte-for-byte', () => {
    const base: WaMediaProcessor = {
      generateImageThumbnail: jest.fn(),
      generateVideoThumbnail: jest.fn(),
      probeMedia: jest.fn(),
      computeWaveform: jest.fn(),
      normalizeVoiceNote: jest.fn(),
      generateStickerThumbnail: jest.fn(),
      detectMimetype: jest.fn(),
    }
    const wrapped = guardDocumentImageThumbnail(base)

    expect(wrapped.generateVideoThumbnail).toBe(base.generateVideoThumbnail)
    expect(wrapped.probeMedia).toBe(base.probeMedia)
    expect(wrapped.computeWaveform).toBe(base.computeWaveform)
    expect(wrapped.normalizeVoiceNote).toBe(base.normalizeVoiceNote)
    expect(wrapped.generateStickerThumbnail).toBe(base.generateStickerThumbnail)
    expect(wrapped.detectMimetype).toBe(base.detectMimetype)
  })

  test('delegates streams because Zapo stages them before normal processing', async () => {
    const generateImageThumbnail = jest.fn().mockResolvedValue({
      jpegThumbnail: Uint8Array.from([1]),
      width: 1,
      height: 1,
    })
    const detectMimetype = jest.fn()
    const processor = guardDocumentImageThumbnail({ generateImageThumbnail, detectMimetype })
    const stream = Readable.from(pdf)

    await expect(processor.generateImageThumbnail!(stream, 32)).resolves.toEqual(expect.objectContaining({ width: 1 }))
    expect(detectMimetype).not.toHaveBeenCalled()
    expect(generateImageThumbnail).toHaveBeenCalledWith(stream, 32, undefined)
  })

  test('keeps custom processors without MIME detection backward compatible', async () => {
    const generateImageThumbnail = jest.fn().mockResolvedValue({ jpegThumbnail: new Uint8Array(), width: 1, height: 1 })
    const processor = guardDocumentImageThumbnail({ generateImageThumbnail })

    await processor.generateImageThumbnail!(Uint8Array.from([1, 2, 3]), 32)
    expect(generateImageThumbnail).toHaveBeenCalled()
  })
})
