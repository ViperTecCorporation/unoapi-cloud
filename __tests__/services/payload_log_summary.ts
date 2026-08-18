import { payloadLogSummary } from '../../src/services/payload_log_summary'

describe('payloadLogSummary', () => {
  test('keeps operational message metadata without logging media bytes or URLs', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'message-id',
              type: 'image',
              image: {
                link: 'https://signed-storage.example/private-object?secret=value',
                data: Buffer.alloc(1024, 7),
              },
            }],
          },
        }],
      }],
    }

    const summary = payloadLogSummary(payload)
    const serialized = JSON.stringify(summary)

    expect(summary).toEqual(expect.objectContaining({
      object: 'whatsapp_business_account',
      message_id: 'message-id',
      message_type: 'image',
      has_media: true,
    }))
    expect(serialized).not.toContain('signed-storage.example')
    expect(serialized).not.toContain('private-object')
    expect(Number(summary.bytes)).toBeGreaterThan(1024)
  })

  test('summarizes an AMQP wrapper using its Cloud API payload', () => {
    expect(payloadLogSummary({
      payload: {
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { statuses: [{ id: 'status-id', status: 'delivered' }] } }] }],
      },
      webhook: { token: 'must-not-appear' },
    })).toEqual(expect.objectContaining({
      object: 'whatsapp_business_account',
      message_id: 'status-id',
      status: 'delivered',
      has_media: false,
    }))
  })
})
