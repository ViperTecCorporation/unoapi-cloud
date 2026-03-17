import crypto from 'crypto'
import { EMBEDDED_SIGNUP_APP_SECRET, UNOAPI_AUTH_TOKEN } from '../defaults'

const TOKEN_PREFIX = 'uno_emb'
const DEFAULT_TTL_SECONDS = 3600

const getSecret = () =>
  `${EMBEDDED_SIGNUP_APP_SECRET || UNOAPI_AUTH_TOKEN || 'unoapi-embedded-secret'}`

const b64url = (value: string) => Buffer.from(value, 'utf-8').toString('base64url')
const ub64url = (value: string) => Buffer.from(value, 'base64url').toString('utf-8')

const sign = (payloadB64: string) =>
  crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url')

export const issueEmbeddedAccessToken = (seed: string, ttlSeconds = DEFAULT_TTL_SECONDS): string => {
  const seedHash = crypto.createHash('sha1').update(`${seed || ''}`).digest('hex')
  const payload = b64url(JSON.stringify({
    seed: seedHash,
    exp: Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds),
  }))
  const signature = sign(payload)
  return `${TOKEN_PREFIX}.${payload}.${signature}`
}

export const isEmbeddedAccessToken = (token: string): boolean => {
  const raw = `${token || ''}`.trim()
  if (!raw.startsWith(`${TOKEN_PREFIX}.`)) return false
  const parts = raw.split('.')
  if (parts.length !== 3) return false
  const [, payloadB64, signature] = parts
  if (!payloadB64 || !signature) return false
  if (sign(payloadB64) !== signature) return false
  try {
    const payload: any = JSON.parse(ub64url(payloadB64))
    const exp = Number(payload?.exp || 0)
    return exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

