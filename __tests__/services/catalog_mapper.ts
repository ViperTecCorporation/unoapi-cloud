import {
  formatCatalogMoney,
  mapOrderMessage,
  mapProductMessage,
} from '../../src/services/catalog/catalog_mapper'

describe('catalog webhook mapper', () => {
  test('formats milli-units as BRL', () => {
    expect(formatCatalogMoney(129900, 'BRL')).toBe('R$ 129,90')
  })

  test('maps a Zapo product snapshot without exposing protocol media fields', () => {
    const output = mapProductMessage({
      businessOwnerJid: '19357434396794@lid',
      body: 'Gostaria deste',
      footer: 'Em estoque',
      product: {
        productId: '12345',
        retailerId: 'sku-001',
        title: 'Óculos Solar',
        description: 'Armação preta',
        currencyCode: 'BRL',
        priceAmount1000: 149900,
        salePriceAmount1000: 129900,
        url: 'https://example.test/products/12345',
        productImage: { directPath: '/encrypted', mediaKey: Buffer.alloc(32) },
      },
    }, { imageUrl: 'https://storage.test/catalog/12345.jpg' })

    expect(output).toEqual(expect.objectContaining({
      type: 'product',
      product: expect.objectContaining({
        product_id: '12345',
        retailer_id: 'sku-001',
        title: 'Óculos Solar',
        price_amount_1000: 149900,
        sale_price_amount_1000: 129900,
        image: { url: 'https://storage.test/catalog/12345.jpg' },
      }),
    }))
    expect(output.fallback_text).toContain('Óculos Solar')
    expect(output.fallback_text).toContain('R$')
    expect(JSON.stringify(output)).not.toContain('mediaKey')
  })

  test('maps an unresolved order using totalCurrencyCode from the official proto', () => {
    const output = mapOrderMessage({
      orderId: 'order-1',
      orderTitle: 'Pedido teste',
      itemCount: 2,
      status: 1,
      totalAmount1000: 249800,
      totalCurrencyCode: 'BRL',
      catalogType: 'NATIVE',
      token: 'must-not-leak',
    })

    expect(output.order).toEqual(expect.objectContaining({
      order_id: 'order-1',
      status: 'inquiry',
      resolution_status: 'summary',
      item_count: 2,
      total_amount_1000: 249800,
    }))
    expect(output.fallback_text).toContain('Pedido recebido')
    expect(output.fallback_text).toContain('R$')
    expect(JSON.stringify(output)).not.toContain('must-not-leak')
  })

  test('maps resolved order items and keeps the public item count', () => {
    const output = mapOrderMessage(
      { orderId: 'order-2', itemCount: 2, status: 2 },
      {
        resolution_status: 'resolved',
        currency: 'BRL',
        subtotal_amount_1000: 30000,
        total_amount_1000: 30000,
        items: [
          {
            product_id: 'p1',
            title: 'Produto',
            quantity: 2,
            currency: 'BRL',
            unit_price_amount_1000: 15000,
            subtotal_amount_1000: 30000,
          },
        ],
      },
    )

    expect(output.order).toEqual(expect.objectContaining({
      status: 'accepted',
      resolution_status: 'resolved',
      item_count: 2,
      total_amount_1000: 30000,
      items: [expect.objectContaining({ product_id: 'p1', quantity: 2 })],
    }))
    expect(output.fallback_text).toContain('2x Produto')
  })
})
