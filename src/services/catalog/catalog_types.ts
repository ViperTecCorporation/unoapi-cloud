export interface CatalogImage {
  url: string
  mime_type?: string
}
export interface CatalogVariant {
  name: string
  value: string
}

export interface CatalogProduct {
  product_id: string
  retailer_id?: string
  title: string
  description?: string
  currency?: string
  price_amount_1000?: number
  sale_price_amount_1000?: number
  formatted_price?: string
  formatted_sale_price?: string
  url?: string
  image?: CatalogImage
  variants?: CatalogVariant[]
  business_owner_id?: string
  body?: string
  footer?: string
}

export type CatalogOrderResolutionStatus = 'resolved' | 'summary' | 'failed'
export type CatalogOrderStatus = 'inquiry' | 'accepted' | 'declined' | 'unknown'

export interface CatalogOrderItem {
  product_id: string
  retailer_id?: string
  title: string
  quantity: number
  currency?: string
  unit_price_amount_1000?: number
  subtotal_amount_1000?: number
  formatted_unit_price?: string
  formatted_subtotal?: string
  image?: CatalogImage
  variants?: CatalogVariant[]
}

export interface CatalogOrderResolution {
  resolution_status: CatalogOrderResolutionStatus
  currency?: string
  subtotal_amount_1000?: number
  total_amount_1000?: number
  items: CatalogOrderItem[]
  error?: string
}

export interface CatalogOrder {
  order_id: string
  title?: string
  status: CatalogOrderStatus
  catalog_type?: string
  resolution_status: CatalogOrderResolutionStatus
  currency?: string
  item_count: number
  subtotal_amount_1000?: number
  total_amount_1000?: number
  formatted_subtotal?: string
  formatted_total?: string
  message?: string
  image?: CatalogImage
  items: CatalogOrderItem[]
}

export interface CatalogWebhookMessage {
  type: 'product' | 'order'
  product?: CatalogProduct
  order?: CatalogOrder
  fallback_text: string
}
