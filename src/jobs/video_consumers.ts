import { amqpConsume } from '../amqp'
import {
  UNOAPI_EXCHANGE_BROKER_NAME,
  UNOAPI_QUEUE_VIDEO_STAGE,
  UNOAPI_QUEUE_VIDEO_TRANSCODE,
  UNOAPI_VIDEO_STAGE_PREFETCH,
} from '../defaults'
import { getConfigRedis } from '../services/config_redis'
import logger from '../services/logger'
import { OutgoingAmqp } from '../services/outgoing_amqp'
import { VideoPreparationFailureReporter } from '../services/video_preparation_failure'
import { VideoStageJob } from './video_stage'
import { VideoTranscodeJob } from './video_transcode'

export const startVideoConsumers = async () => {
  const outgoingAmqp = new OutgoingAmqp(getConfigRedis)
  const failureReporter = new VideoPreparationFailureReporter(getConfigRedis, outgoingAmqp)
  const videoStageJob = new VideoStageJob(getConfigRedis, undefined, failureReporter)
  const videoTranscodeJob = new VideoTranscodeJob(getConfigRedis, undefined, failureReporter)

  logger.info('Starting video staging consumer with prefetch %s', UNOAPI_VIDEO_STAGE_PREFETCH)
  await amqpConsume(
    UNOAPI_EXCHANGE_BROKER_NAME,
    UNOAPI_QUEUE_VIDEO_STAGE,
    '*',
    videoStageJob.consume.bind(videoStageJob),
    { notifyFailedMessages: false, prefetch: UNOAPI_VIDEO_STAGE_PREFETCH, type: 'topic' },
  )

  logger.info('Starting isolated video transcoding consumer with concurrency 1')
  await amqpConsume(
    UNOAPI_EXCHANGE_BROKER_NAME,
    UNOAPI_QUEUE_VIDEO_TRANSCODE,
    '*',
    videoTranscodeJob.consume.bind(videoTranscodeJob),
    { notifyFailedMessages: false, prefetch: 1, type: 'topic' },
  )
}
