export type SessionStatus =
  | 'online'
  | 'offline'
  | 'disconnected'
  | 'connecting'
  | 'standby'
  | 'restart_required'
  | 'forwarder'
  | string

export type ConnectionType = 'qrcode' | 'pairing_code'

export interface WebhookConfig {
  id: string
  url?: string
  urlAbsolute?: string
  enabled?: boolean
  disabled?: boolean
  token?: string
  header?: string
  timeoutMs?: number
  sendNewMessages?: boolean
  sendUpdateMessages?: boolean
  sendGroupMessages?: boolean
  sendOutgoingMessages?: boolean
  sendNewsletterMessages?: boolean
  sendIncomingMessages?: boolean
  sendTranscribeAudio?: boolean
  addToBlackListOnOutgoingMessageWithTtl?: number | string
  typebot?: boolean
}

export interface SessionConfig {
  id?: string
  phone?: string
  session_phone?: string
  display_phone_number?: string
  label?: string
  status?: SessionStatus
  provider?: 'zapo' | 'baileys' | 'forwarder'
  server?: string
  connectionType?: ConnectionType | 'forward'
  authToken?: string
  proxyUrl?: string
  openaiApiKey?: string
  openaiApiTranscribeModel?: string
  groqApiKey?: string
  groqApiTranscribeModel?: string
  groqApiBaseUrl?: string
  rejectCalls?: string
  rejectCallsWebhook?: string
  ignoreGroupMessages?: boolean
  ignoreNewsletterMessages?: boolean
  ignoreHistoryMessages?: boolean
  historyMaxAgeDays?: number
  readOnReceipt?: boolean
  readOnReply?: boolean
  markOnlineOnConnect?: boolean
  sendProfilePicture?: boolean
  ignoreOwnMessages?: boolean
  ignoreYourselfMessages?: boolean
  sendConnectionStatus?: boolean
  ignoreBroadcastStatuses?: boolean
  notifyFailedMessages?: boolean
  composingMessage?: boolean
  sendReactionAsReply?: boolean
  autoConnect?: boolean
  ignoreBroadcastMessages?: boolean
  rateLimitGlobalPerMinute?: number
  rateLimitPerToPerMinute?: number
  rateLimitBlockSeconds?: number
  qrTimeoutMs?: number
  webhooks?: WebhookConfig[]
  [key: string]: unknown
}

export interface ContactDirectoryItem {
  user_id: string
  phone_number?: string
  display_name?: string
  push_name?: string
  username?: string
  picture?: string
  last_updated_ms: number
}

export interface ContactDirectoryPage {
  contacts: ContactDirectoryItem[]
  next_cursor: string
  has_more: boolean
}

export interface GroupSummary {
  id?: string
  jid?: string
  subject?: string
  description?: string
  picture?: string
  participants_count?: number
  participantsCount?: number
  total_participant_count?: number
}

export interface GroupPage {
  phone: string
  groups: GroupSummary[]
}

export interface QrBroadcast {
  phone?: string
  type?: string
  content?: string
  ts?: number
}

export type SessionTab = 'overview' | 'config' | 'contacts' | 'webhooks' | 'groups'
