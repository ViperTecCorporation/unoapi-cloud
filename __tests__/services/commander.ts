import { parseDocument } from 'yaml'
import { amqpPublish } from '../../src/amqp'
import { CommanderJob } from '../../src/jobs/commander'
import { setConfig } from '../../src/services/redis'

const bindTemplate = jest.fn()

jest.mock('../../src/amqp', () => ({
  amqpPublish: jest.fn(),
}))
jest.mock('../../src/services/redis', () => ({
  setConfig: jest.fn(),
}))
jest.mock('../../src/services/template', () => ({
  Template: jest.fn().mockImplementation(() => ({ bind: bindTemplate })),
}))

describe('service commander', () => {
  const url = 'http://localhost:3000'
  const header = 'api_access_token'
  const token = 123

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('parse yml \n', async () => {
    const string = `url: ${url}\nheader: ${header}\ntoken: ${token}`
    // const object = {
    //   header,
    //   url,
    //   token,
    // }
    const doc = parseDocument(string)
    expect(doc.toJS().header).toBe(header)
    expect(doc.toJS().token).toBe(token)
    expect(doc.toJS().url).toBe(url)
  })

  test('parse yml', async () => {
    const string = `
    url: ${url}
    header: ${header}
    token: ${token}`
    const doc = parseDocument(string)
    expect(doc.toJS().header).toBe(header)
    expect(doc.toJS().token).toBe(token)
    expect(doc.toJS().url).toBe(url)
  })

  test.each([
    ['unoapi-webhook', 'url: https://example.test/webhook'],
    ['unoapi-config', 'readOnReply: true'],
  ])('publishes %s reload to the session provider queue', async (template, text) => {
    bindTemplate.mockResolvedValueOnce({ text })
    const phone = '5566999554300'
    const job = new CommanderJob(
      { formatAndSend: jest.fn() } as never,
      jest.fn().mockResolvedValue({
        server: 'server_1',
        provider: 'zapo',
      }) as never,
    )

    await job.consume(phone, {
      payload: {
        type: 'template',
        to: phone,
        template: { name: template, components: [] },
      },
    })

    expect(setConfig).toHaveBeenCalled()
    expect(amqpPublish).toHaveBeenCalledWith(
      expect.any(String),
      'unoapi.reload.server_1.zapo',
      phone,
      { phone },
      { type: 'topic' },
    )
  })
})
