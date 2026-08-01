import { reviveZapoMediaBinaryFields } from '../../../src/services/zapo/zapo_media'

describe('reviveZapoMediaBinaryFields', () => {
  test('restores AMQP-serialized media bytes without changing unrelated fields', () => {
    const message: any = {
      messageTimestamp: { low: 1_784_981_631, high: 0, unsigned: true },
      imageMessage: {
        directPath: '/media',
        mediaKey: { 1: 2, 0: 1 },
        fileSha256: { type: 'Buffer', data: [3, 4] },
        fileEncSha256: [5, 6],
        fileLength: { low: 12_345, high: 0, unsigned: true },
        caption: 'foto',
      },
    }

    expect(reviveZapoMediaBinaryFields(message)).toBe(message)
    expect(message.messageTimestamp).toBe(1_784_981_631)
    expect(message.imageMessage.mediaKey).toEqual(Uint8Array.from([1, 2]))
    expect(message.imageMessage.fileSha256).toEqual(Uint8Array.from([3, 4]))
    expect(message.imageMessage.fileEncSha256).toEqual(Uint8Array.from([5, 6]))
    expect(message.imageMessage.fileLength).toBe(12_345)
    expect(message.imageMessage.caption).toBe('foto')
  })
})
