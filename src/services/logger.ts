import P, { Level } from 'pino'

import { UNO_LOG_LEVEL } from '../defaults'
import { redactLogArguments } from './log_redaction'

const logger = P({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
  hooks: {
    logMethod(args, method) {
      method.apply(this, redactLogArguments(args))
    },
  },
})
logger.level = UNO_LOG_LEVEL as Level

export default logger
