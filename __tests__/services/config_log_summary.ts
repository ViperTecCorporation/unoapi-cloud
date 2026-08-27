import { defaultConfig } from '../../src/services/config'
import { configLogSummary } from '../../src/services/config_log_summary'

describe('configLogSummary', () => {
  test('keeps operational counters without URLs, credentials or provider secrets', () => {
    const summary = configLogSummary({
      ...defaultConfig,
      provider: 'zapo',
      server: 'server_1',
      authToken: 'api-secret',
      openaiApiKey: 'openai-secret',
      groqApiKey: 'groq-secret',
      webhooks: [
        { ...defaultConfig.webhooks[0], enabled: true, token: 'webhook-secret', urlAbsolute: 'https://private.example/hook' },
        { ...defaultConfig.webhooks[0], id: 'typebot', enabled: false, typebot: true, token: 'typebot-secret' },
      ],
    })

    expect(summary).toEqual(expect.objectContaining({
      provider: 'zapo',
      server: 'server_1',
      webhook_count: 2,
      enabled_webhook_count: 1,
      typebot_webhook_count: 1,
    }))
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('private.example')
    expect(serialized).not.toContain('authToken')
  })
})
