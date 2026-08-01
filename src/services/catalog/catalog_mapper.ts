import type {
  CatalogImage,
  CatalogOrder,
  CatalogOrderResolution,
  CatalogOrderStatus,
  CatalogProduct,
  CatalogWebhookMessage,
} from './catalog_types'

const asText = (value: unknown) => `${value ?? ''}`.trim()

const asFiniteNumber = (value: unknown): number | undefined => {
  if (value == null || value === '') return undefined
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    value = (value as any).toNumber()
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}
export const formatCatalogMoney = (amount1000?: number, currency?: string): string | undefined => {
  if (!Number.isFinite(amount1000) || !currency) return undefined
  const amount = (amount1000 as number) / 1000
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

const httpImage = (value: unknown): CatalogImage | undefined => {
  const url = asText(value)
  return /^https?:\/\//i.test(url) ? { url } : undefined
}

const orderStatus = (value: unknown): CatalogOrderStatus => {
  switch (Number(value)) {
    case 1: return 'inquiry'
    case 2: return 'accepted'
    case 3: return 'declined'
    default: return 'unknown'
  }
}

const productFallback = (product: CatalogProduct) => [
  `*Produto*: ${product.title || product.product_id || 'Produto compartilhado'}`,
  product.formatted_sale_price || product.formatted_price
    ? `Preço: ${product.formatted_sale_price || product.formatted_price}`
    : '',
  product.retailer_id ? `Código: ${product.retailer_id}` : '',
  product.description || '',
  product.url || '',
].filter(Boolean).join('\n')

export const mapProductMessage = (
  raw: any,
  metadata?: { imageUrl?: string },
): CatalogWebhookMessage => {
  const snapshot = raw?.product || {}
  const currency = asText(snapshot.currencyCode) || undefined
  const price = asFiniteNumber(snapshot.priceAmount1000)
  const salePrice = asFiniteNumber(snapshot.salePriceAmount1000)
  const product: CatalogProduct = {
    product_id: asText(snapshot.productId) || asText(snapshot.retailerId) || 'unknown',
    title: asText(snapshot.title) || asText(raw?.catalog?.title) || 'Produto compartilhado',
    ...(asText(snapshot.retailerId) ? { retailer_id: asText(snapshot.retailerId) } : {}),
    ...(asText(snapshot.description) ? { description: asText(snapshot.description) } : {}),
    ...(currency ? { currency } : {}),
    ...(price !== undefined ? {
      price_amount_1000: price,
      formatted_price: formatCatalogMoney(price, currency),
    } : {}),
    ...(salePrice !== undefined ? {
      sale_price_amount_1000: salePrice,
      formatted_sale_price: formatCatalogMoney(salePrice, currency),
    } : {}),
    ...(asText(snapshot.url) ? { url: asText(snapshot.url) } : {}),
    ...(httpImage(metadata?.imageUrl || snapshot.signedUrl) ? {
      image: httpImage(metadata?.imageUrl || snapshot.signedUrl),
    } : {}),
    ...(asText(raw?.businessOwnerJid) ? { business_owner_id: asText(raw.businessOwnerJid) } : {}),
    ...(asText(raw?.body) ? { body: asText(raw.body) } : {}),
    ...(asText(raw?.footer) ? { footer: asText(raw.footer) } : {}),
  }
  return { type: 'product', product, fallback_text: productFallback(product) }
}

const orderFallback = (order: CatalogOrder) => {
  const lines = [
    '*Pedido recebido*',
    order.title || '',
    order.item_count > 0 ? `Itens: ${order.item_count}` : '',
  ]
  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.title}${item.formatted_subtotal ? ` — ${item.formatted_subtotal}` : ''}`)
  }
  if (order.formatted_total) lines.push(`Total: ${order.formatted_total}`)
  if (order.message) lines.push(order.message)
  return lines.filter(Boolean).join('\n')
}

export const mapOrderMessage = (
  raw: any,
  resolution?: CatalogOrderResolution,
  metadata?: { imageUrl?: string },
): CatalogWebhookMessage => {
  const rawCurrency = asText(raw?.totalCurrencyCode) || undefined
  const rawTotal = asFiniteNumber(raw?.totalAmount1000)
  const currency = resolution?.currency || rawCurrency
  const total = resolution?.total_amount_1000 ?? rawTotal
  const subtotal = resolution?.subtotal_amount_1000
  const items = resolution?.items || []
  const count = asFiniteNumber(raw?.itemCount)
  const order: CatalogOrder = {
    order_id: asText(raw?.orderId) || 'unknown',
    status: orderStatus(raw?.status),
    resolution_status: resolution?.resolution_status || 'summary',
    item_count: count === undefined ? items.reduce((sum, item) => sum + item.quantity, 0) : count,
    items,
    ...(asText(raw?.orderTitle) ? { title: asText(raw.orderTitle) } : {}),
    ...(asText(raw?.catalogType) ? { catalog_type: asText(raw.catalogType) } : {}),
    ...(currency ? { currency } : {}),
    ...(subtotal !== undefined ? {
      subtotal_amount_1000: subtotal,
      formatted_subtotal: formatCatalogMoney(subtotal, currency),
    } : {}),
    ...(total !== undefined ? {
      total_amount_1000: total,
      formatted_total: formatCatalogMoney(total, currency),
    } : {}),
    ...(asText(raw?.message) ? { message: asText(raw.message) } : {}),
    ...(httpImage(metadata?.imageUrl) ? { image: httpImage(metadata?.imageUrl) } : {}),
  }
  return { type: 'order', order, fallback_text: orderFallback(order) }
}
