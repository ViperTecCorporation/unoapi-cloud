export const PROFILE_PICTURE_MAX_BYTES = 10 * 1024 * 1024

export const detectProfilePictureContentType = (bytes: Buffer): string | undefined => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return undefined
}

export const validateProfilePictureBuffer = (buffer: Buffer): string => {
  if (buffer.length > PROFILE_PICTURE_MAX_BYTES) throw new Error('Profile picture exceeds the maximum allowed size')
  const contentType = detectProfilePictureContentType(buffer)
  if (!contentType) throw new Error('Profile picture content is not a supported image')
  return contentType
}
