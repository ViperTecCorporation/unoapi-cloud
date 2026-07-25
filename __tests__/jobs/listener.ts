import { ListenerJob } from '../../src/jobs/listener'
import { UNOAPI_SERVER_NAME } from '../../src/defaults'
import { packWaMessage } from '../../src/services/wa_message_envelope'

describe('listener job', () => {
  test('keeps the packed payload retry-safe when media processing fails', async () => {
    const original = {
      key: {
        remoteJid: '123456789@lid',
        remoteJidAlt: '5566999554300@s.whatsapp.net',
        id: 'zapo-media-id',
        fromMe: true,
      },
      message: {
        imageMessage: {
          url: 'https://example.test/image',
          mimetype: 'image/jpeg',
          mediaKey: Uint8Array.from([1, 2, 3, 4]),
          fileLength: 123,
        },
      },
    }
    const packed = packWaMessage(original)
    const data = { messages: [packed], type: 'message', splited: true }
    const snapshot = JSON.parse(JSON.stringify(data))
    const process = jest.fn().mockRejectedValue(new Error('webhook unavailable'))
    const job = new ListenerJob(
      { process } as never,
      { send: jest.fn() } as never,
      jest.fn().mockResolvedValue({ server: UNOAPI_SERVER_NAME, provider: 'zapo' }) as never,
    )

    await expect(job.consume('5566999554300', data)).rejects.toThrow('webhook unavailable')

    expect(data).toEqual(snapshot)
    expect(process).toHaveBeenCalledWith(
      '5566999554300',
      [
        expect.objectContaining({
          key: expect.objectContaining({
            id: 'zapo-media-id',
            remoteJidAlt: '5566999554300@s.whatsapp.net',
          }),
          message: expect.objectContaining({
            imageMessage: expect.objectContaining({
              mimetype: 'image/jpeg',
              mediaKey: expect.any(Uint8Array),
            }),
          }),
        }),
      ],
      'message',
    )
  })
})
