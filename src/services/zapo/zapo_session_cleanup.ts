import type { WaStoreSession } from 'zapo-js'

const sessionDomains = [
  'auth',
  'signal',
  'preKey',
  'session',
  'identity',
  'senderKey',
  'appState',
  'retry',
  'groupMetadata',
  'deviceList',
  'messages',
  'messageSecret',
  'threads',
  'contacts',
  'privacyToken',
] as const

export async function clearZapoSession(session: WaStoreSession) {
  const results = await Promise.allSettled(
    sessionDomains.map(async (domain) => session[domain].clear()),
  )
  const failedDomains = results.flatMap((result, index) => (
    result.status === 'rejected' ? [sessionDomains[index]] : []
  ))

  await session.destroyCaches()

  if (failedDomains.length) {
    throw new Error(`zapo_session_clear_failed: ${failedDomains.join(',')}`)
  }
}
