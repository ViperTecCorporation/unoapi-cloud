// Baileys and Zapo ship different generated versions of WhatsApp's protobuf.
// Shared services deliberately treat protobuf envelopes as provider-neutral;
// each provider adapter keeps its concrete generated type at its boundary.
export type WhatsAppMessage = any
export type WhatsAppMessageKey = any
export type WhatsAppMessageContent = any
export type WhatsAppVersion = [number, number, number]

export type WhatsAppContact = {
  id?: string
  lid?: string
  name?: string
  notify?: string
  verifiedName?: string
  imgUrl?: string
  [key: string]: unknown
}

export type WhatsAppGroupMetadata = any

export type ProviderAuthState = any
export type ProviderSocket = Record<string, any>
