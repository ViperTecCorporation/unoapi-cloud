import { mock } from 'jest-mock-extended'
import type { Client } from '../../../src/services/client'
import { ActiveZapoMessageMetadataResolver } from '../../../src/services/zapo/zapo_message_metadata'

describe('ActiveZapoMessageMetadataResolver', () => {
  test('delegates metadata enrichment to the active session client', async () => {
    const client = mock<Client>()
    client.getMessageMetadata.mockImplementation(async (message: any) => ({
      ...message,
      __unoapiMediaBytes: Buffer.from([1, 2, 3]),
    }))
    const resolver = new ActiveZapoMessageMetadataResolver(() => client)

    const result: any = await resolver.resolve('5566999999999', { key: { id: 'media-1' } })

    expect(client.getMessageMetadata).toHaveBeenCalledWith({ key: { id: 'media-1' } })
    expect(result.__unoapiMediaBytes).toEqual(Buffer.from([1, 2, 3]))
  })

  test('keeps non-media processing available while the session client is absent', async () => {
    const message = { key: { id: 'text-1' }, message: { conversation: 'oi' } }
    const resolver = new ActiveZapoMessageMetadataResolver(() => undefined)

    await expect(resolver.resolve('5566999999999', message)).resolves.toBe(message)
  })
})
