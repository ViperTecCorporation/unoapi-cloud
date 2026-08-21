type JsonRecord = Record<string, any>

const asRecord = (value: unknown): JsonRecord => value && typeof value === 'object' ? value as JsonRecord : {}

export const payloadLogSummary = (payload: unknown, serialized?: string): Record<string, unknown> => {
  const root = asRecord(payload)
  const cloud = asRecord(root.payload || root)
  const value = asRecord(cloud.entry?.[0]?.changes?.[0]?.value)
  const message = asRecord(value.messages?.[0] || value.statuses?.[0] || root.message || root)
  const messageType = `${message.type || ''}`.trim()
  const messageId = `${message.id || message.message_id || ''}`.trim()
  const body = serialized ?? JSON.stringify(payload)

  return {
    bytes: Buffer.byteLength(body),
    ...(cloud.object ? { object: `${cloud.object}` } : {}),
    ...(messageId ? { message_id: messageId } : {}),
    ...(messageType ? { message_type: messageType } : {}),
    ...(message.status ? { status: `${message.status}` } : {}),
    has_media: ['image', 'video', 'audio', 'document', 'sticker'].includes(messageType),
  }
}
