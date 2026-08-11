import { amqpPublish } from '../amqp'
import {
  UNOAPI_EXCHANGE_BROKER_NAME,
  UNOAPI_QUEUE_VIDEO_TRANSCODE,
} from '../defaults'
import type { getConfig } from '../services/config'
import logger from '../services/logger'
import { VideoPreparationService } from '../services/video_preparation'
import type { VideoPreparationJobData } from '../services/video_preparation_types'
import type { VideoPreparationFailureReporter } from '../services/video_preparation_failure'

type RetryContext = { countRetries: number; maxRetries: number }

export class VideoStageJob {
  constructor(
    private readonly getConfig: getConfig,
    private readonly preparation = new VideoPreparationService(),
    private readonly failureReporter?: VideoPreparationFailureReporter,
  ) {}

  async consume(phone: string, data: VideoPreparationJobData, retry?: RetryContext) {
    try {
      const link = `${data?.payload?.video?.link || ''}`.trim()
      if (!link) throw new Error('video_stage_link_missing')
      const config = await this.getConfig(phone)
      const { mediaStore } = await config.getStore(phone, config)
      const staged = await this.preparation.stage(mediaStore, phone, data.id, link)
      logger.info('Video staged without blocking the session queue phone=%s id=%s bytes=%s', phone, data.id, staged.sizeBytes)
      await amqpPublish(
        UNOAPI_EXCHANGE_BROKER_NAME,
        UNOAPI_QUEUE_VIDEO_TRANSCODE,
        phone,
        { ...data, sourceKey: staged.sourceKey },
        { type: 'topic', priority: 5, maxRetries: 2 },
      )
      return staged
    } catch (error) {
      if (retry && retry.countRetries >= retry.maxRetries && this.failureReporter) {
        try { await this.failureReporter.report(phone, data, error) } catch (reportError) {
          logger.error(reportError as any, 'Failed to report permanent video staging error phone=%s id=%s', phone, data.id)
        }
      }
      throw error
    }
  }
}
