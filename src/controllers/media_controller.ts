import { Request, Response } from 'express'
import { getConfig } from '../services/config'
import logger from '../services/logger'

export class MediaController {
  private baseUrl: string
  private getConfig: getConfig

  constructor(baseUrl: string, getConfig: getConfig) {
    this.baseUrl = baseUrl
    this.getConfig = getConfig
  }

  public async index(req: Request, res: Response) {
    logger.debug('media index method %s', req.method)
    logger.debug('media index headers %s', JSON.stringify(req.headers))
    logger.debug('media index params %s', JSON.stringify(req.params))
    logger.debug('media index body %s', JSON.stringify(req.body))
    const { phone, media_id: mediaId } = req.params
    const config = await this.getConfig(phone)
    const store = await config.getStore(phone, config)
    const { mediaStore } = store
    const mediaResult = await mediaStore.getMedia(this.baseUrl, mediaId)
    if (mediaResult) {
      logger.debug('media index response %s', JSON.stringify(mediaResult))
      return res.status(200).json(mediaResult)
    } else {
      logger.debug('media index response 404')
      return res.sendStatus(404)
    }
  }

  public async typebot(req: Request, res: Response) {
    logger.debug('media typebot method %s', req.method)
    logger.debug('media typebot headers %s', JSON.stringify(req.headers))
    logger.debug('media typebot params %s', JSON.stringify(req.params))
    logger.debug('media typebot body %s', JSON.stringify(req.body))
    const raw = `${req.params.media_id || ''}`
    const match = raw.match(/^(\d+)-(.+)$/)
    if (!match) {
      logger.debug('media typebot invalid id %s', raw)
      return res.sendStatus(404)
    }
    const [, phone, mediaId] = match
    try {
      const config = await this.getConfig(phone)
      const store = await config.getStore(phone, config)
      const { mediaStore, dataStore } = store
      const mediaPayload = await dataStore.loadMediaPayload(mediaId)
      if (!mediaPayload) {
        logger.debug('media typebot not found %s', mediaId)
        return res.sendStatus(404)
      }
      const mimeType = mediaPayload?.mime_type || mediaPayload?.content_type
      let url: string | undefined = mediaPayload?.url
      if (!url) {
        try {
          const fallback = await mediaStore.getMedia(this.baseUrl, mediaId)
          url = fallback?.url
        } catch (e) {
          logger.warn(e as any, 'media typebot failed to compute fallback url %s', mediaId)
        }
      }
      if (!url) {
        logger.debug('media typebot missing url %s', mediaId)
        return res.sendStatus(404)
      }
      return res.status(200).json({ url, mime_type: mimeType })
    } catch (e) {
      logger.warn(e as any, 'media typebot error %s', raw)
      return res.sendStatus(500)
    }
  }

  public async download(req: Request, res: Response) {
    logger.debug('media download method %s', req.method)
    logger.debug('media download headers %s', JSON.stringify(req.headers))
    logger.debug('media download params %s', JSON.stringify(req.params))
    logger.debug('media download body %s', JSON.stringify(req.body))
    const { phone, file } = req.params
    const config = await this.getConfig(phone)
    const store = await config.getStore(phone, config)
    const { mediaStore } = store
    return mediaStore.downloadMedia(res, `${phone}/${file}`)
  }
}
