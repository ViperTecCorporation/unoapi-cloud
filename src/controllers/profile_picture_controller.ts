import { Request, Response } from 'express'
import { getConfig } from '../services/config'
import { resolveSessionPhoneByMetaId } from '../services/meta_alias'
import { normalizeProfilePictureId } from '../services/profile_picture_identity'
import logger from '../services/logger'
import { PROFILE_PICTURE_MAX_BYTES } from '../services/profile_picture_content'

const PROFILE_PICTURE_CACHE_CONTROL = 'private, max-age=86400, must-revalidate'

const etagMatches = (header: string | undefined, etag: string): boolean => {
  if (!header) return false
  const normalize = (value: string) => value.trim().replace(/^W\//i, '')
  const expected = normalize(etag)
  return header.split(',').some((candidate) => candidate.trim() === '*' || normalize(candidate) === expected)
}

export class ProfilePictureController {
  constructor(private readonly getConfig: getConfig) {}

  public async download(req: Request, res: Response) {
    const pictureId = normalizeProfilePictureId(req.params.picture_id)
    if (!pictureId) return res.status(400).json({ error: { code: 100, title: 'Invalid profile picture ID' } })

    const sessionPhone = await resolveSessionPhoneByMetaId(req.params.session)
    try {
      const config = await this.getConfig(sessionPhone)
      const store = await config.getStore(sessionPhone, config)
      const picture = await store.mediaStore.getProfilePictureObject?.(pictureId)
      if (!picture) return res.sendStatus(404)

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
