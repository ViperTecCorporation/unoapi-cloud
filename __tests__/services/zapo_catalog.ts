import { ZapoCatalog } from '../../src/services/zapo/zapo_catalog'

describe('ZapoCatalog', () => {
  const mediaStore = {
    saveDownloadedMedia: jest.fn(async (message: any) => {
      message.message.imageMessage.url = `https://storage.test/${message.key.id}.jpg`
      return message
    }),
  }

  beforeEach(() => jest.clearAllMocks())

  test('downloads and stores a product image before exposing its URL', async () => {
    const downloadBytes = jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]))
    const catalog = new ZapoCatalog(
      { message: { downloadBytes }, lowlevel: { query: jest.fn() } } as any,
      { mediaStore } as any,
      '5566999999999',
    )
    const message: any = {
      key: { id: 'provider-1', remoteJid: 'contact@lid' },
      message: {
        productMessage: {
          product: {
            productId: 'product-1',
            productImage: {
              directPath: '/image',
              mediaKey: Uint8Array.from({ length: 32 }, () => 1),
            },
          },
        },
      },
    }

    await catalog.enrich(message)

    expect(downloadBytes).toHaveBeenCalled()
    expect(message.__unoapiCatalog.productImageUrl).toContain('provider-1-catalog-product')
  })

  test('keeps an order deliverable when detail resolution fails', async () => {
    const query = jest.fn().mockRejectedValue(new Error('query failed'))
    const catalog = new ZapoCatalog(
      { message: { downloadBytes: jest.fn() }, lowlevel: { query } } as any,
      { mediaStore } as any,
      '5566999999999',
    )
    const message: any = {
      key: { id: 'provider-2', remoteJid: 'contact@lid' },
      message: {
        orderMessage: {
          orderId: 'order-1',
          sellerJid: 'seller@lid',
          token: 'private-token',
          thumbnail: Uint8Array.from([255, 216, 255, 217]),
        },
      },
    }

    await catalog.enrich(message)

    expect(message.__unoapiCatalog.orderResolution).toEqual({
      resolution_status: 'failed',
      items: [],
    })
    expect(message.__unoapiCatalog.orderImageUrl).toContain('provider-2-catalog-order')
  })
})
