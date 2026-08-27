import { redactLogString } from './log_redaction'

const DEFAULT_MAX_CHARS = 768

export const webhookErrorBodySummary = (
  body: string,
  contentType = '',
  maxChars = DEFAULT_MAX_CHARS,
): string => {
  const source = `${body || ''}`
  const bytes = Buffer.byteLength(source)
  if (!source.trim()) return '<empty body>'

  if (/text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(source) || /^\s*<html[\s>]/i.test(source)) {
    return `<html body omitted; ${bytes} bytes>`
  }

  const normalized = redactLogString(source).replace(/\s+/g, ' ').trim()
  const limit = Math.max(64, maxChars)
  if (normalized.length <= limit) return normalized

  return `${normalized.slice(0, limit)}… <truncated; ${bytes} bytes total>`
}
