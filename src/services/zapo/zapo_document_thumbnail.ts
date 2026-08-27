import type {
  WaMediaProcessor,
  WaMediaProcessorCallContext,
  WaMediaProcessorInput,
} from 'zapo-js/media'

const hasBytes = (input: Uint8Array, expected: number[], offset = 0) =>
  expected.every((value, index) => input[offset + index] === value)

const hasAscii = (input: Uint8Array, expected: string, offset = 0) =>
  expected.split('').every((value, index) => input[offset + index] === value.charCodeAt(0))

export const isKnownImageBytes = (input: WaMediaProcessorInput): boolean => {
  if (!(input instanceof Uint8Array)) return false

  return hasBytes(input, [0xff, 0xd8, 0xff])
    || hasBytes(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    || hasAscii(input, 'GIF87a')
    || hasAscii(input, 'GIF89a')
    || (hasAscii(input, 'RIFF') && hasAscii(input, 'WEBP', 8))
    || hasAscii(input, 'BM')
    || hasBytes(input, [0x49, 0x49, 0x2a, 0x00])
    || hasBytes(input, [0x4d, 0x4d, 0x00, 0x2a])
}

export const isImagePreviewInput = async (
  processor: WaMediaProcessor,
  input: WaMediaProcessorInput,
  context?: WaMediaProcessorCallContext,
): Promise<boolean> => {
  // Zapo resolves streams to a temporary file before running its processor.
  // Preserve delegation for direct/custom uses where the input is still a stream.
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) return true
  if (!processor.detectMimetype) return true

  try {
    const mimetype = await processor.detectMimetype(input, context)
    if (mimetype) return mimetype.startsWith('image/')
    return isKnownImageBytes(input)
  } catch {
    return isKnownImageBytes(input)
  }
}

export const guardDocumentImageThumbnail = (processor: WaMediaProcessor): WaMediaProcessor => {
  const generateImageThumbnail = processor.generateImageThumbnail
  if (!generateImageThumbnail) return processor

  return {
    ...processor,
    generateImageThumbnail: async (input, maxEdge, context) => {
      // Zapo 1.7.1 invokes the image thumbnail processor for every document.
      // Generate a preview only when the bytes are actually an image. PDF,
      // Office, ZIP, text and other accepted documents are sent without one,
      // matching the Baileys document path and leaving upload bytes untouched.
      if (!await isImagePreviewInput(processor, input, context)) return undefined as never
      return generateImageThumbnail(input, maxEdge, context)
    },
  }
}
