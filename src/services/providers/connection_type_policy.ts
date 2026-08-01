import type { connectionType } from '../config'
import type { WhatsAppEngine } from './provider_types'

type ConnectionTypePolicyInput = {
  hasStoredConfig: boolean
  previousProvider: WhatsAppEngine
  previousConnectionType: connectionType
  requestedConnectionType?: connectionType
}

export function resolveRegistrationConnectionType(input: ConnectionTypePolicyInput) {
  const requested = input.requestedConnectionType
  const locked = input.hasStoredConfig
    && input.previousProvider === 'zapo'
    && !!requested
    && requested !== input.previousConnectionType

  return {
    value: locked ? input.previousConnectionType : requested,
    locked,
  }
}
