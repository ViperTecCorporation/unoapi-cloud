import type { WaClient } from 'zapo-js'
import type { Store } from '../store'
import logger from '../logger'
import { normalizeMessageContent } from '../transformer/message_type'
import { reviveZapoMediaBinaryFields } from './zapo_media'
import { ZapoOrderResolver } from './zapo_order_resolver'

interface CatalogMetadata {
  productImageUrl?: string
  orderImageUrl?: string
  orderResolution?: Awaited<ReturnType<ZapoOrderResolver['resolve']>>
}
const isHttpUrl = (value: unknown) => /^https?:\/\//i.test(`${value || ''}`.trim())

export class ZapoCatalog {
  private readonly orderResolver: ZapoOrderResolver

  constructor(
    private readonly client: Pick<WaClient, 'lowlevel' | 'message'>,
    private readonly store: Store,
    private readonly phone: string,
  ) {
    this.orderResolver = new ZapoOrderResolver(client)
  }

  private async saveImage(source: any, bytes: Buffer, suffix: string): Promise<string | undefined> {
    if (!this.store.mediaStore.saveDownloadedMedia) return undefined
    const id = `${source?.key?.id || 'catalog'}-${suffix}`
    const synthetic: any = {
      key: { ...(source?.key || {}), id },
      message: {
        imageMessage: {
          mimetype: 'image/jpeg',
          fileLength: bytes.length,
        },
      },
    }
    await this.store.mediaStore.saveDownloadedMedia(synthetic, bytes)
    const url = `${synthetic.message.imageMessage.url || ''}`.trim()
    return isHttpUrl(url) ? url : undefined
  }

  private async productImage(source: any, productMessage: any): Promise<string | undefined> {
    const snapshot = productMessage?.product
    const media = snapshot?.productImage
    if (!media) return isHttpUrl(snapshot?.signedUrl) ? `${snapshot.signedUrl}` : undefined
    const synthetic: any = { message: { imageMessage: { ...media } } }
    reviveZapoMediaBinaryFields(synthetic)
    const bytes = await this.client.message.downloadBytes(synthetic.message, { maxBytes: 15 * 1024 * 1024 })
    return this.saveImage(source, Buffer.from(bytes), 'catalog-product')
  }

  async enrich<T>(source: T): Promise<T> {
    const payload: any = source
    const content: any = normalizeMessageContent(payload?.message)
    const productMessage = content?.productMessage
    const orderMessage = content?.orderMessage
    if (!productMessage && !orderMessage) return source

    const metadata: CatalogMetadata = { ...(payload.__unoapiCatalog || {}) }
    if (productMessage) {
      try {
        metadata.productImageUrl = await this.productImage(payload, productMessage)
      } catch (error) {
        logger.warn(error as any, 'Zapo catalog product image failed phone=%s message=%s', this.phone, payload?.key?.id || '<none>')
      }
    }
    if (orderMessage) {
      try {
        metadata.orderResolution = await this.orderResolver.resolve(orderMessage)
      } catch (error) {
        metadata.orderResolution = { resolution_status: 'failed', items: [] }
        logger.warn(error as any, 'Zapo catalog order resolution failed phone=%s order=%s', this.phone, orderMessage?.orderId || '<none>')
      }
      const thumbnail = orderMessage?.thumbnail
      if (thumbnail instanceof Uint8Array && thumbnail.length) {
        try {
          metadata.orderImageUrl = await this.saveImage(payload, Buffer.from(thumbnail), 'catalog-order')
        } catch (error) {
          logger.warn(error as any, 'Zapo catalog order thumbnail failed phone=%s order=%s', this.phone, orderMessage?.orderId || '<none>')
        }
      }
    }
    payload.__unoapiCatalog = metadata
    return source
  }
}
