import { amqpPublish } from '../amqp'
import { UNOAPI_EXCHANGE_BRIDGE_NAME, UNOAPI_QUEUE_INCOMING } from '../defaults'
import type { getConfig } from '../services/config'
import logger from '../services/logger'
import { providerQueueName } from '../services/providers/provider_queue'
import { isProviderRuntimeEnabled } from '../services/providers/provider_runtime_policy'
import { VideoPreparationService } from '../services/video_preparation'
import type { VideoPreparationJobData } from '../services/video_preparation_types'
import type { VideoPreparationFailureReporter } from '../services/video_preparation_failure'

type RetryContext = { countRetries: number; maxRetries: number }

export class VideoTranscodeJob {
  constructor(
    private readonly getConfig: getConfig,
    private readonly preparation = new VideoPreparationService(),
    private readonly failureReporter?: VideoPreparationFailureReporter,
  ) {}

  async consume(phone: string, data: VideoPreparationJobData, retry?: RetryContext) {
    try {
      if (!data.sourceKey) throw new Error('video_stage_source_key_missing')
      const config = await this.getConfig(phone)
      if (!isProviderRuntimeEnabled(config.provider)) throw new Error('video_target_provider_disabled')
      const { mediaStore } = await config.getStore(phone, config)
      const prepared = await this.preparation.prepare(mediaStore, phone, data.id, data.sourceKey)
      const originalVideo = data.payload?.video || {}
      const originalFilename = `${originalVideo.filename || 'video.mp4'}`
      const filename = originalFilename.replace(/\.[^.]+$/, '') + '.mp4'
      const payload = {
        ...data.payload,
        video: {
          ...originalVideo,
          link: prepared.link,
          mime_type: 'video/mp4',
          filename,
        },
      }
      const options = { ...(data.options || {}), videoPrepared: true, priority: 5, type: 'direct' as const }
      await amqpPublish(
        UNOAPI_EXCHANGE_BRIDGE_NAME,
        providerQueueName(UNOAPI_QUEUE_INCOMING, config.server || 'server_1', config.provider),
        phone,
        { payload, id: data.id, options },
        options,
      )
      logger.info(
        'Prepared video returned to provider queue phone=%s id=%s bytes=%s transcoded=%s',
        phone,
        data.id,
        prepared.sizeBytes,
        prepared.transcoded,
      )
      return prepared
    } catch (error) {
      if (retry && retry.countRetries >= retry.maxRetries && this.failureReporter) {
        try { await this.failureReporter.report(phone, data, error) } catch (reportError) {
          logger.error(reportError as any, 'Failed to report permanent video transcoding error phone=%s id=%s', phone, data.id)
        }
      }
      throw error
    }
  }
}
