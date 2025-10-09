import NodeCache from 'node-cache'
import { RATE_LIMIT_BLOCK_SECONDS, RATE_LIMIT_GLOBAL_PER_MINUTE, RATE_LIMIT_PER_TO_PER_MINUTE } from '../defaults'
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
  try {
    if (RATE_LIMIT_GLOBAL_PER_MINUTE > 0) {
      const key = rateGlobalKey(session)
      const v = await redisIncrWithTtl(key, windowSec)
      if (v > RATE_LIMIT_GLOBAL_PER_MINUTE) {
        logger.warn('Rate limit global exceeded for %s: %s > %s', session, v, RATE_LIMIT_GLOBAL_PER_MINUTE)
        return { allowed: false, reason: 'rate_global_exceeded', retryAfterSec: RATE_LIMIT_BLOCK_SECONDS }
      }
    }
  } catch (e) {
    // fallback memory
    if (RATE_LIMIT_GLOBAL_PER_MINUTE > 0) {
      const v = incrMem(`rl:global:${session}`, windowSec)
      if (v > RATE_LIMIT_GLOBAL_PER_MINUTE) {
        return { allowed: false, reason: 'rate_global_exceeded', retryAfterSec: RATE_LIMIT_BLOCK_SECONDS }
      }
    }
  }
  try {
    if (RATE_LIMIT_PER_TO_PER_MINUTE > 0) {
      const key = rateToKey(session, to)
      const v = await redisIncrWithTtl(key, windowSec)
      if (v > RATE_LIMIT_PER_TO_PER_MINUTE) {
        logger.warn('Rate limit per-to exceeded for %s -> %s: %s > %s', session, to, v, RATE_LIMIT_PER_TO_PER_MINUTE)
        return { allowed: false, reason: 'rate_to_exceeded', retryAfterSec: RATE_LIMIT_BLOCK_SECONDS }
      }
    }
  } catch (e) {
    if (RATE_LIMIT_PER_TO_PER_MINUTE > 0) {
      const v = incrMem(`rl:to:${session}:${to}`, windowSec)
      if (v > RATE_LIMIT_PER_TO_PER_MINUTE) {
        return { allowed: false, reason: 'rate_to_exceeded', retryAfterSec: RATE_LIMIT_BLOCK_SECONDS }
      }
    }
  }
  return { allowed: true }
}

