import { downloadZapoMediaBytes, isZapoExpiredMediaError } from '../../src/services/zapo/zapo_media_reupload'

describe('downloadZapoMediaBytes', () => {
  const source = () => ({
    key: {
      id: 'message-1',
      remoteJid: '111@lid',
      participant: '222@lid',
      fromMe: false,
      isNewsletter: false,
    },
    message: {
      documentMessage: {
        directPath: '/expired',
        mediaKey: Uint8Array.from([1, 2, 3]),
      },
    },
  })

  test.each([
    new Error('download failed with status 404 for https://mmg.whatsapp.net/file'),
    Object.assign(new Error('gone'), { response: { status: 410 } }),
  ])('recognizes only explicit expired-media statuses', (error) => {
    expect(isZapoExpiredMediaError(error)).toBe(true)
    expect(isZapoExpiredMediaError(new Error('download timeout'))).toBe(false)
    expect(isZapoExpiredMediaError(Object.assign(new Error('server'), { status: 500 }))).toBe(false)
  })

  test('requests one reupload and retries with the refreshed directPath', async () => {
    const original = source()
    const downloadBytes = jest
      .fn()
      .mockRejectedValueOnce(new Error('download failed with status 404 for https://mmg.whatsapp.net/file'))
      .mockResolvedValueOnce(Uint8Array.from([9, 8, 7]))
    const requestMediaReupload = jest.fn().mockResolvedValue({
      messageId: 'message-1',
      result: 'success',
      resultCode: 0,
      directPath: '/refreshed',
    })

    await expect(
      downloadZapoMediaBytes({ downloadBytes, requestMediaReupload } as never, original.message, { retryContext: { key: original.key } }),
    ).resolves.toEqual(Uint8Array.from([9, 8, 7]))

    expect(requestMediaReupload).toHaveBeenCalledWith({
      messageId: 'message-1',
      chatJid: '111@lid',
      mediaKey: Uint8Array.from([1, 2, 3]),
      fromMe: false,
      participant: '222@lid',
    })
    expect(downloadBytes).toHaveBeenNthCalledWith(2, {
      documentMessage: expect.objectContaining({ directPath: '/refreshed' }),
    })
    expect(original.message.documentMessage.directPath).toBe('/expired')
  })

  test('does not retry timeouts, generic server errors or newsletters', async () => {
    for (const [error, value] of [
      [new Error('download timeout'), source()],
      [Object.assign(new Error('server'), { status: 500 }), source()],
      [Object.assign(new Error('gone'), { status: 410 }), { ...source(), key: { ...source().key, isNewsletter: true } }],
    ] as const) {
      const downloadBytes = jest.fn().mockRejectedValue(error)
      const requestMediaReupload = jest.fn()
      await expect(
        downloadZapoMediaBytes({ downloadBytes, requestMediaReupload } as never, value.message, { retryContext: { key: value.key } }),
      ).rejects.toBe(error)
      expect(requestMediaReupload).not.toHaveBeenCalled()
    }
  })

  test.each(['not_found', 'decryption_error', 'general_error'] as const)('keeps the original 404 when the primary answers %s', async (result) => {
    const error = new Error('download failed with status 404 for https://mmg.whatsapp.net/file')
    const downloadBytes = jest.fn().mockRejectedValue(error)
    const requestMediaReupload = jest.fn().mockResolvedValue({ messageId: 'message-1', result, resultCode: 1 })

    const value = source()
    await expect(
      downloadZapoMediaBytes({ downloadBytes, requestMediaReupload } as never, value.message, { retryContext: { key: value.key } }),
    ).rejects.toBe(error)
    expect(downloadBytes).toHaveBeenCalledTimes(1)
  })
})
