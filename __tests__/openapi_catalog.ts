import fs from 'node:fs'
import YAML from 'yaml'

describe('OpenAPI catalog webhook contract', () => {
  const spec = YAML.parse(fs.readFileSync('docs/openapi.yaml', 'utf8'))
  const schemas = spec.components.schemas
  const message = schemas.WebhookInbound.properties.entry.items.properties.changes
    .items.properties.value.properties.messages.items.properties

  test('documents product and order inbound message types', () => {
    expect(message.product.$ref).toBe('#/components/schemas/CatalogProduct')
    expect(message.order.$ref).toBe('#/components/schemas/CatalogOrder')
    expect(message.fallback_text.type).toBe('string')
  })

  test('documents order resolution states and item money fields', () => {
    expect(schemas.CatalogOrder.properties.resolution_status.enum).toEqual([
      'resolved',
      'summary',
      'failed',
    ])
    expect(schemas.CatalogOrderItem.properties.unit_price_amount_1000.format).toBe('int64')
    expect(schemas.CatalogProduct.properties.sale_price_amount_1000.format).toBe('int64')
  })
})
