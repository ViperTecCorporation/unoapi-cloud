import type { DataStore } from './data_store'

export const createProviderDataStoreBase = (): DataStore => {
  const store: DataStore = {
    state: {},
    saveCreds: async () => undefined,
    type: 'provider',
    loadKey: async () => undefined,
    setKey: async () => undefined,
    writeToFile: () => undefined,
    readFromFile: () => undefined,
    toJSON: () => ({}),
    fromJSON: () => undefined,
    loadMessage: async () => undefined,
    setUnoId: async (_id, unoId) => unoId,
    setMediaPayload: async () => undefined,
    loadMediaPayload: async () => undefined,
    setImageUrl: async () => undefined,
    getImageUrl: async () => undefined,
    loadImageUrl: async (jid, socket) => {
      const cached = await store.getImageUrl(jid)
      if (cached) return cached
      return socket.profilePictureUrl?.(jid, 'image')
    },
    setGroupMetada: async () => undefined,
    getGroupMetada: async () => undefined,
    loadGroupMetada: async (jid, socket) => {
      const cached = await store.getGroupMetada(jid)
      if (cached) return cached
      return socket.groupMetadata?.(jid)
    },
    loadUnoId: async () => undefined,
    loadProviderId: async () => undefined,
    setStatus: async () => undefined,
    loadStatus: async () => undefined,
    getJid: async () => undefined,
    loadJid: async (phone, socket) => {
      const cached = await store.getJid(phone)
      if (cached) return cached
      const result = await socket.onWhatsApp?.(phone)
      return result?.[0]?.jid
    },
    setJid: async () => undefined,
    setJidIfNotFound: async (phone, jid) => {
      if (!await store.getJid(phone)) await store.setJid(phone, jid)
    },
    setMessage: async () => undefined,
    cleanSession: async () => undefined,
    loadTemplates: async () => [],
    setTemplates: async () => undefined,
  }
  return store
}
