import NodeCache from 'node-cache'
import { RATE_LIMIT_BLOCK_SECONDS, RATE_LIMIT_GLOBAL_PER_MINUTE, RATE_LIMIT_PER_TO_PER_MINUTE } from '../defaults'
import { getConfigRedis } from './config_redis'
import { redisIncrWithTtl, rateGlobalKey, rateToKey } from './redis'
import logger from './logger'

const mem = new NodeCache()

const incrMem = (key: string, ttlSec: number): number => {
  const v = (mem.get<number>(key) || 0) + 1
  mem.set(key, v, ttlSec)
  return v
}

export type RateDecision = {
  allowed: boolean
  reason?: string
  retryAfterSec?: number
}

export const allowSend = async (session: string, to: string): Promise<RateDecision> => {
  const windowSec = 60
  // Load per-session overrides when available (falls back to env)
  let gl = RATE_LIMIT_GLOBAL_PER_MINUTE
  let perTo = RATE_LIMIT_PER_TO_PER_MINUTE
  let block = RATE_LIMIT_BLOCK_SECONDS
  try {
    const cfg = await getConfigRedis(session)
    gl = Number(cfg?.rateLimitGlobalPerMinute ?? gl)
    perTo = Number(cfg?.rateLimitPerToPerMinute ?? perTo)
    block = Number(cfg?.rateLimitBlockSeconds ?? block)
  } catch {}
  try {
    if (gl > 0) {
      const key = rateGlobalKey(session)
      const v = await redisIncrWithTtl(key, windowSec)
      if (v > gl) {
        logger.warn('Rate limit global exceeded for %s: %s > %s', session, v, gl)
        return { allowed: false, reason: 'rate_global_exceeded', retryAfterSec: block }
      }
    }
  } catch (e) {
    // fallback memory
    if (gl > 0) {
      const v = incrMem(`rl:global:${session}`, windowSec)
      if (v > gl) {
        return { allowed: false, reason: 'rate_global_exceeded', retryAfterSec: block }
      }
    }
  }
  try {
    if (perTo > 0) {
      const key = rateToKey(session, to)
      const v = await redisIncrWithTtl(key, windowSec)
      if (v > perTo) {
        logger.warn('Rate limit per-to exceeded for %s -> %s: %s > %s', session, to, v, perTo)
        return { allowed: false, reason: 'rate_to_exceeded', retryAfterSec: block }
      }
    }
  } catch (e) {
    if (perTo > 0) {
      const v = incrMem(`rl:to:${session}:${to}`, windowSec)
      if (v > perTo) {
        return { allowed: false, reason: 'rate_to_exceeded', retryAfterSec: block }
      }
    }
  }
  return { allowed: true }
}
