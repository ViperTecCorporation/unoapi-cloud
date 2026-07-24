import fetch from 'node-fetch'
import { downloadGroupPicture } from '../../src/services/zapo/zapo_group_picture'

jest.mock('node-fetch')

const toBuffer = jest.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
const jpeg = jest.fn(() => ({ toBuffer }))
const resize = jest.fn(() => ({ jpeg }))
const sharp = jest.fn(() => ({ resize }))

jest.mock('sharp', () => ({
  __esModule: true,
  default: sharp,
}))

describe('Zapo group picture preparation', () => {
  test('converts a downloaded image to the WhatsApp profile picture format', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    ;(fetch as unknown as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => png,
    })

    const result = await downloadGroupPicture('https://example.test/group.png')

    expect(sharp).toHaveBeenCalledWith(png)
    expect(resize).toHaveBeenCalledWith(640, 640)
    expect(jpeg).toHaveBeenCalledWith({ quality: 50 })
    expect(result).toEqual(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))
  })

  test('rejects a group picture that cannot be downloaded', async () => {
    ;(fetch as unknown as jest.Mock).mockResolvedValue({ ok: false, status: 404 })

    await expect(downloadGroupPicture('https://example.test/missing.png'))
      .rejects.toThrow('Could not download group picture: HTTP 404')
  })
})
