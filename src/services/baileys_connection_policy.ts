import type { WAVersion } from '@whiskeysockets/baileys'
import { release } from 'os'

const linkedDeviceClient = 'Unoapi'
const linkedDeviceName = 'Chrome'

export const BAILEYS_CONNECTION_POLICY = Object.freeze({
  connectingTimeoutMs: 180_000,
  idleReconnectEnabled: false,
  idleReconnectMs: 30 * 60_000,
  idleReconnectCheckMs: 60_000,
  clearAppStateSyncOnConnect: false,
  reloadDebounceMs: 15_000,
  qrTimeoutMs: 60_000,
  qrPostLoginSuppressMs: 45_000,
  validateSessionNumber: false,
  countryCode: 'BR',
  whatsappVersion: undefined as WAVersion | undefined,
  allowFullHistorySync: false,
  linkedDeviceClient,
  linkedDeviceName,
  defaultBrowser: Object.freeze([linkedDeviceClient, linkedDeviceName, release()]),
  wamTelemetry: Object.freeze({
    enabled: true,
    debugEvents: false,
    flushIntervalMs: 5_000,
    maxEvents: 50,
  }),
})
