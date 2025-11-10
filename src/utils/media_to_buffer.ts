
import fetch, { Response, RequestInit } from 'node-fetch'
import logger from '../services/logger'
import { toBuffer } from '../services/transformer'

export default async function (url: string, token: string, timeoutMs: number) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Authorization': `Bearer ${token}`
  }
  const baseOpts: RequestInit = { method: 'GET', headers }
  const withSignal = (opts: RequestInit) => {
    if (timeoutMs > 0) return { ...opts, signal: AbortSignal.timeout(timeoutMs) }
    return opts
  }
  const fetchWithRetry = async (u: string, init: RequestInit, attempts = 2): Promise<Response> => {
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      try {
        return await fetch(u, withSignal(init))
      } catch (e: any) {
        lastErr = e
        const name = (e?.name || '').toString()
        const code = (e?.cause?.code || e?.code || '').toString()
        const transient = name === 'AbortError' || ['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENOTFOUND'].includes(code)
        if (i + 1 < attempts && transient) {
          await new Promise((r) => setTimeout(r, 500))
          continue
        }
        break
      }
    }
    throw lastErr
  }
  let response: Response
  try {
    logger.debug('Requesting media url %s...', url)
    response = await fetchWithRetry(url, baseOpts)
    logger.debug('Requested media url %s!', url)
  } catch (error) {
    logger.error(`Error on Request media url ${url}`)
    logger.error(error)
    throw error
  }
  if (!response?.ok) {
    logger.error(`Error on Request media url ${url}`)
    throw await response.text()
  }
  const clonedResponse = response.clone()
  const json = await response.json()
  const link = json['url']
  if (!link) {
    const message = `Error on retrieve media url on response: ${await clonedResponse.text()}`
    logger.error(message)
    throw message
  }
  logger.debug('Downloading media url %s...', link)
  // Para links externos (ex.: CDN/S3 presign), evitar enviar Authorization herdado
  const isExternal = !link.startsWith('http://localhost') && !link.startsWith('https://localhost') && !link.includes('/v15.0/download/')
  const dlOpts: RequestInit = isExternal ? { method: 'GET' } : baseOpts
  response = await fetchWithRetry(link, dlOpts)
  logger.debug('Downloaded media url %s!', link)
  if (!response?.ok) {
    logger.error(`Error on download media url ${link}`)
    throw await response.text()
  }
  const arrayBuffer = await response.arrayBuffer()
  return { buffer: toBuffer(arrayBuffer), link, mimeType: json['mime_type'] }
}
