import { DataStore } from '../../src/services/data_store'
import { getDataStoreFile } from '../../src/services/data_store_file'
import { defaultConfig } from '../../src/services/config'

describe('service data store file', () => {
  const phone = `${new Date().getMilliseconds()}`
  test('return a new instance', async () => {
    const dataStore: DataStore = await getDataStoreFile(phone, defaultConfig)
    expect(dataStore).toBe(dataStore)
  })

  test('loads status by provider id when status was stored by uno id', async () => {
    const dataStore: DataStore = await getDataStoreFile(`${phone}-status`, defaultConfig)
    await dataStore.setUnoId('provider-id-1', 'uno-id-1')
    await dataStore.setStatus('uno-id-1', 'sent')

    await expect(dataStore.loadStatus('provider-id-1')).resolves.toBe('sent')
  })
})
