import * as dotenv from 'dotenv'
dotenv.config()

import { version } from '../package.json'
import { startVideoConsumers } from './jobs/video_consumers'
import logger from './services/logger'
import { ensureRequiredRedis } from './services/redis_runtime'

const startVideoWorker = async () => {
  await ensureRequiredRedis()
  logger.info('Unoapi Cloud version %s starting dedicated video worker...', version)
  await startVideoConsumers()
  logger.info('Unoapi Cloud version %s started dedicated video worker!', version)
}

startVideoWorker().catch((error) => {
  logger.error(error, 'Failed to start dedicated video worker')
  process.exit(1)
})
