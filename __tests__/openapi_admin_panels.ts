import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

describe('OpenAPI admin panels', () => {
  const document = yaml.load(
    fs.readFileSync(path.resolve(__dirname, '../docs/openapi.yaml'), 'utf8'),
  ) as any

  test('documents RabbitMQ inspection and confirmed cleanup', () => {
    const route = document.paths['/admin/rabbitmq/queues/{queue}/messages']
    expect(route.get.parameters.find((item: any) => item.name === 'session')).toBeDefined()
    expect(route.delete.requestBody.content['application/json'].schema.required)
      .toEqual(expect.arrayContaining(['count', 'confirm']))
  })

  test('documents Redis CRUD and read-only query allowlist', () => {
    expect(document.paths['/admin/redis/keys/{key}'].put).toBeDefined()
    expect(document.paths['/admin/redis/keys/{key}'].delete).toBeDefined()
    expect(document.paths['/admin/redis/query'].post.requestBody.content['application/json']
      .schema.properties.command.enum).toEqual([
      'SCAN', 'TYPE', 'TTL', 'GET', 'HGETALL', 'LRANGE', 'SMEMBERS', 'ZRANGE',
    ])
  })
})
