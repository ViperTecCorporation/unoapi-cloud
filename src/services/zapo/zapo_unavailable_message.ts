export type ZapoUnavailableKind = 'view_once' | 'hosted'

type ZapoUnavailableEvent = {
  key: object
  kind: ZapoUnavailableKind
  timestampSeconds?: number
  pushName?: string
}

const STUB_PARAMETER_BY_KIND: Record<ZapoUnavailableKind, string> = {
  view_once: 'view_once_unavailable',
  hosted: 'hosted_message_unavailable',
}

export const createZapoUnavailableMessage = (event: ZapoUnavailableEvent) => ({
  key: event.key,
  messageTimestamp: event.timestampSeconds,
  pushName: event.pushName,
  messageStubType: 'FUTUREPROOF',
  messageStubParameters: [STUB_PARAMETER_BY_KIND[event.kind]],
})
