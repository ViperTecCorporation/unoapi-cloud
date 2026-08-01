import { createPairingCodeImageDataUrl } from '../../src/services/zapo/pairing_code_image'

describe('pairing code image', () => {
  test('renders the normalized pairing code as a portable image data URL', async () => {
    const dataUrl = await createPairingCodeImageDataUrl('1234-5678')
    const svg = Buffer.from(dataUrl.replace('data:image/svg+xml;base64,', ''), 'base64').toString()

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(svg).toContain('width="720" height="360"')
    expect(svg).toContain('1234 5678')
  })

  test('rejects an empty pairing code', async () => {
    await expect(createPairingCodeImageDataUrl('---')).rejects.toThrow('pairing_code_is_empty')
  })
})
