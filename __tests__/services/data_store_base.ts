import { createProviderDataStoreBase } from '../../src/services/data_store_base'

describe('provider-neutral data store base', () => {
  test('provides safe defaults and delegates optional socket lookups', async () => {
    const store = createProviderDataStoreBase()
    const socket = {
      profilePictureUrl: jest.fn().mockResolvedValue('https://cdn/picture.jpg'),
      groupMetadata: jest.fn().mockResolvedValue({ id: '1@g.us', subject: 'Grupo' }),
      onWhatsApp: jest.fn().mockResolvedValue([{ jid: '1@s.whatsapp.net' }]),
    }

    await expect(store.loadImageUrl('1@lid', socket)).resolves.toBe('https://cdn/picture.jpg')
    await expect(store.loadGroupMetada('1@g.us', socket)).resolves.toEqual(
      expect.objectContaining({ subject: 'Grupo' }),
    )
    await expect(store.loadJid('1', socket)).resolves.toBe('1@s.whatsapp.net')
  })
})
