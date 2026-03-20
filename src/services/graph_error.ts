import { Response } from 'express'

type GraphErrorOptions = {
  type?: string
  code?: number
  errorSubcode?: number
  fbtraceId?: string
  includeLegacy?: boolean
}

export const sendGraphError = (
  res: Response,
  statusCode: number,
  message: string,
  options: GraphErrorOptions = {},
) => {
  const type = options.type || 'OAuthException'
  const code = typeof options.code === 'number' ? options.code : 100
  const includeLegacy = options.includeLegacy !== false
  const payload: any = {
    error: {
      message,
      type,
      code,
    },
  }
  if (typeof options.errorSubcode === 'number') payload.error.error_subcode = options.errorSubcode
  if (options.fbtraceId) payload.error.fbtrace_id = options.fbtraceId
  if (includeLegacy) {
    payload.status = 'error'
    payload.message = message
  }
  return res.status(statusCode).json(payload)
}

