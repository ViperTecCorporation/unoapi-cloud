import { amqpPublish } from '../amqp'
import { UNOAPI_EXCHANGE_BRIDGE_NAME, UNOAPI_QUEUE_LOGOUT } from '../defaults'
import { getConfig } from './config'
import { Logout } from './logout'
import { clearLegacyBaileysSession, type LegacyBaileysCleanup } from './legacy_baileys_cleanup'
import { providerQueueName } from './providers/provider_queue'
import { isProviderRuntimeEnabled } from './providers/provider_runtime_policy'

export class LogoutAmqp implements Logout {
  private getConfig: getConfig

  constructor(
    getConfig: getConfig,
    private readonly legacyCleanup: LegacyBaileysCleanup = clearLegacyBaileysSession,
  ) {
    this.getConfig = getConfig
  }

  public async run(phone: string) {
    const config = await this.getConfig(phone)
    if (!isProviderRuntimeEnabled(config.provider)) {
      await this.legacyCleanup(phone)
      return
    }
    await amqpPublish(
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      providerQueueName(UNOAPI_QUEUE_LOGOUT, config.server || 'server_1', config.provider),
      '',
      { phone, ts: Date.now(), source: 'deregister_api' },
      { type: 'direct' }
    )
  }
}
