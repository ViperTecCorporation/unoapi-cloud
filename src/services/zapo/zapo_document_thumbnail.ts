import type {
  WaMediaProcessor,
  WaMediaProcessorCallContext,
  WaMediaProcessorInput,
} from 'zapo-js/media'

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
    return !!mimetype?.startsWith('image/')
  } catch {
    return false
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
