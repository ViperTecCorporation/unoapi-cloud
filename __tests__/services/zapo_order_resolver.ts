import type { BinaryNode } from 'zapo-js'
import fs from 'node:fs'
import {
  decimalMoneyToAmount1000,
  ZAPO_BIZ_QUERY_ORDER_DOCUMENT_ID,
  ZapoOrderResolver,
} from '../../src/services/zapo/zapo_order_resolver'

const resultNode = (data: unknown): BinaryNode => ({
  tag: 'iq',
  attrs: { type: 'result', id: '1' },
  content: [
    {
      tag: 'result',
      attrs: { format: 'json' },
      content: JSON.stringify({ data }),
    },
  ],
})

describe('ZapoOrderResolver', () => {
  test('uses the BizQueryOrder persisted id from the installed official Zapo spec', () => {
    const source = fs.readFileSync('node_modules/zapo-js/spec/mex/index.js', 'utf8')
    const officialId = source.match(/BizQueryOrder:\s*Object\.freeze\(\{\s*docId:\s*'([^']+)'/)?.[1]
    expect(officialId).toBeTruthy()
    expect(ZAPO_BIZ_QUERY_ORDER_DOCUMENT_ID).toBe(officialId)
  })

  test.each([
    ['0', 0],
    ['149.70', 149700],
    ['12.3456', 12345],
    ['-1.25', -1250],
    ['invalid', undefined],
  ])('converts decimal money %s to amount1000', (input, expected) => {
    expect(decimalMoneyToAmount1000(input)).toBe(expected)
  })

  test('does not query when the protocol order reference is incomplete', async () => {
    const query = jest.fn()
    const resolver = new ZapoOrderResolver({ lowlevel: { query } } as any)

    await expect(resolver.resolve({ orderId: '1' })).resolves.toEqual({
      resolution_status: 'summary',
      items: [],
    })
    expect(query).not.toHaveBeenCalled()
  })

  test('queries BizQueryOrder and maps products, quantities, variants and totals', async () => {
    const query = jest.fn().mockResolvedValue(resultNode({
      xwa_checkout_get_order_info: {
        order: {
          products: [
            {
              id: 'product-1',
              name: 'Óculos Solar',
              price: '129.90',
              currency: 'BRL',
              quantity: '2',
              variant_info: {
                variant_properties: [{ name: 'Cor', value: 'Preto' }],
              },
              media: {
                images: [{ request_image_url: 'https://images.test/product-1.jpg' }],
              },
            },
          ],
          price_details: {
            subtotal_amount: '259.80',
            total_amount: '259.80',
            currency: 'BRL',
          },
        },
      },
    }))
    const resolver = new ZapoOrderResolver({ lowlevel: { query } } as any)

    const output = await resolver.resolve({
      orderId: 'order-1',
      sellerJid: '19357434396794@lid',
      token: 'private-token',
    })

    expect(output).toEqual({
      resolution_status: 'resolved',
      currency: 'BRL',
      subtotal_amount_1000: 259800,
      total_amount_1000: 259800,
      items: [
        expect.objectContaining({
          product_id: 'product-1',
          title: 'Óculos Solar',
          quantity: 2,
          unit_price_amount_1000: 129900,
          subtotal_amount_1000: 259800,
          image: { url: 'https://images.test/product-1.jpg' },
          variants: [{ name: 'Cor', value: 'Preto' }],
        }),
      ],
    })
    const request = query.mock.calls[0][0]
    expect(request.attrs).toEqual(expect.objectContaining({ type: 'get', xmlns: 'w:mex' }))
    expect(JSON.parse(request.content[0].content)).toEqual(expect.objectContaining({
      variables: {
        request: {
          order: expect.objectContaining({
            token: { sensitive_string_value: 'private-token' },
          }),
        },
      },
    }))
  })

  test('returns summary when the order query has no product details', async () => {
    const query = jest.fn().mockResolvedValue(resultNode({
      xwa_checkout_get_order_info: { order: { products: [] } },
    }))
    const resolver = new ZapoOrderResolver({ lowlevel: { query } } as any)

    await expect(resolver.resolve({
      orderId: 'order-1',
      sellerJid: 'seller@lid',
      token: 'private-token',
    })).resolves.toEqual({ resolution_status: 'summary', items: [] })
  })
})
