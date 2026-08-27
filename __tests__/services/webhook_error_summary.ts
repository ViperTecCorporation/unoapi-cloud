import { webhookErrorBodySummary } from '../../src/services/webhook_error_summary'

describe('webhookErrorBodySummary', () => {
  test('omits HTML error pages while preserving their byte size', () => {
    const html = '<!DOCTYPE html><html><body>' + 'Cloudflare error '.repeat(100) + '</body></html>'

    const summary = webhookErrorBodySummary(html, 'text/html; charset=utf-8')

    expect(summary).toMatch(/^<html body omitted; \d+ bytes>$/)
    expect(summary).not.toContain('Cloudflare error')
  })

  test('redacts and truncates textual error responses', () => {
    const body = `Authorization=private-token ${'validation failed '.repeat(100)}`

    const summary = webhookErrorBodySummary(body, 'application/json', 120)

    expect(summary).toContain('Authorization=[REDACTED]')
    expect(summary).toContain('<truncated;')
    expect(summary).not.toContain('private-token')
    expect(summary.length).toBeLessThan(220)
  })

  test('describes an empty response body', () => {
    expect(webhookErrorBodySummary('')).toBe('<empty body>')
  })
})
