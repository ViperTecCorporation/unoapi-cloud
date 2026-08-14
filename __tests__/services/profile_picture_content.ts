import {
  detectProfilePictureContentType,
  PROFILE_PICTURE_MAX_BYTES,
  validateProfilePictureBuffer,
} from '../../src/services/profile_picture_content'

describe('profile picture content validation', () => {
  test.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    [Buffer.from('GIF89a', 'ascii'), 'image/gif'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]), 'image/webp'],
  ])('detects supported image bytes', (buffer, contentType) => {
    expect(detectProfilePictureContentType(buffer)).toBe(contentType)
    expect(validateProfilePictureBuffer(buffer)).toBe(contentType)
  })

  test('rejects non-image content', () => {
    expect(() => validateProfilePictureBuffer(Buffer.from('not-an-image'))).toThrow('not a supported image')
  })

  test('rejects images above the configured limit', () => {
    const oversized = Buffer.alloc(PROFILE_PICTURE_MAX_BYTES + 1)
    oversized.set([0xff, 0xd8, 0xff], 0)
    expect(() => validateProfilePictureBuffer(oversized)).toThrow('maximum allowed size')
  })
})
