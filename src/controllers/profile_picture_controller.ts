import { Request, Response } from 'express'
import { getConfig } from '../services/config'
import { resolveSessionPhoneByMetaId } from '../services/meta_alias'
import { normalizeProfilePictureId } from '../services/profile_picture_identity'
import logger from '../services/logger'
import { PROFILE_PICTURE_MAX_BYTES } from '../services/profile_picture_content'
import { ProfilePictureMissCache } from '../services/profile_picture_miss_cache'
import type { ProfilePictureObject } from '../services/media_store'

const PROFILE_PICTURE_CACHE_CONTROL = 'private, max-age=86400, must-revalidate'

const etagMatches = (header: string | undefined, etag: string): boolean => {
  if (!header) return false
  const normalize = (value: string) => value.trim().replace(/^W\//i, '')
  const expected = normalize(etag)
  return header.split(',').some((candidate) => candidate.trim() === '*' || normalize(candidate) === expected)
}

export class ProfilePictureController {
  private readonly missCaches = new Map<string, ProfilePictureMissCache>()
  private readonly pendingLookups = new Map<string, Promise<ProfilePictureObject | undefined>>()

  constructor(private readonly getConfig: getConfig) {}

  public async download(req: Request, res: Response) {
    const pictureId = normalizeProfilePictureId(req.params.picture_id)
    if (!pictureId) return res.status(400).json({ error: { code: 100, title: 'Invalid profile picture ID' } })

    const sessionPhone = await resolveSessionPhoneByMetaId(req.params.session)
    try {
      const config = await this.getConfig(sessionPhone)
      const missCacheKey = `${sessionPhone}:${config.useRedis ? 'redis' : 'memory'}`
      let missCache = this.missCaches.get(missCacheKey)
      if (!missCache) {
        missCache = new ProfilePictureMissCache({ useRedis: !!config.useRedis })
        this.missCaches.set(missCacheKey, missCache)
      }
      if (await missCache.has(sessionPhone, pictureId)) return res.sendStatus(404)

      const store = await config.getStore(sessionPhone, config)
      const lookupKey = `${sessionPhone}:${pictureId}`
      let lookup = this.pendingLookups.get(lookupKey)
      if (!lookup) {
        lookup = Promise.resolve(store.mediaStore.getProfilePictureObject?.(pictureId))
          .finally(() => this.pendingLookups.delete(lookupKey))
        this.pendingLookups.set(lookupKey, lookup)
      }
      const picture = await lookup
      if (!picture) {
        await missCache.mark(sessionPhone, pictureId)
        return res.sendStatus(404)
      }
      await missCache.invalidate(sessionPhone, pictureId)

      const metadata = picture.metadata || {}
      const contentType = `${metadata.content_type || ''}`.split(';')[0].trim().toLowerCase()
      if (!contentType.startsWith('image/')) return res.sendStatus(415)

      const contentLength = Number(metadata.content_length)
      if (!Number.isFinite(contentLength) || contentLength < 0) return res.sendStatus(500)
      if (contentLength > PROFILE_PICTURE_MAX_BYTES) return res.sendStatus(413)

      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Length', `${contentLength}`)
      res.setHeader('Cache-Control', PROFILE_PICTURE_CACHE_CONTROL)
      if (metadata.etag) res.setHeader('ETag', metadata.etag)
      if (metadata.last_modified) {
        const lastModified = new Date(metadata.last_modified)
        if (!Number.isNaN(lastModified.getTime())) res.setHeader('Last-Modified', lastModified.toUTCString())
      }

      if (metadata.etag && etagMatches(req.header('if-none-match'), metadata.etag)) {
        res.removeHeader('Content-Length')
        return res.sendStatus(304)
      }

      const stream = await picture.openStream()
      stream.on('error', (error) => {
        logger.warn(error as Error, 'Profile picture stream failed for session=%s picture_id=%s', sessionPhone, pictureId)
        if (!res.headersSent) res.sendStatus(500)
        else res.destroy(error as Error)
      })
      return stream.pipe(res)
    } catch (error) {
      logger.warn(error as Error, 'Profile picture download failed for session=%s picture_id=%s', sessionPhone, pictureId)
      if (!res.headersSent) return res.sendStatus(500)
      return res.destroy(error as Error)
    }
  }
}
