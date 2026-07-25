import type { SessionProvider, WhatsAppEngine } from './provider_types'
import { resolveWhatsAppEngine } from './provider_resolver'

// Baileys remains in source control only as rollback/reference during the Zapo
// stabilization cycle. Re-enable deliberately in code after restoring its
// worker, tests and operational runbook.
export const BAILEYS_RUNTIME_ENABLED = false

export const isProviderRuntimeEnabled = (
  provider: SessionProvider | WhatsAppEngine | undefined,
): boolean => resolveWhatsAppEngine(provider) === 'zapo' || BAILEYS_RUNTIME_ENABLED

export const providerRuntimeStatus = (
  provider: SessionProvider | WhatsAppEngine | undefined,
  status: string | undefined,
): string => isProviderRuntimeEnabled(provider) ? `${status || 'offline'}` : 'offline'
