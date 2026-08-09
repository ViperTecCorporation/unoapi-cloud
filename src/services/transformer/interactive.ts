const parseJsonObject = (value: unknown): Record<string, any> | undefined => {
  if (!value) return undefined
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value !== 'string') return undefined

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : undefined
  } catch {
    return undefined
  }
}

const orderDetailsParametersFromMessageParams = (messageParams: Record<string, any>) => {
  const nested =
    messageParams?.action?.parameters ||
    messageParams?.parameters ||
    messageParams?.review_and_pay?.parameters ||
    messageParams?.review_and_pay ||
    messageParams?.order_details?.action?.parameters ||
    messageParams?.order_details?.parameters ||
    messageParams?.order_details ||
    messageParams

  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested
    : undefined
}

const explicitlyIdentifiesOrderDetails = (messageParams: Record<string, any>) => {
  const markers = [
    messageParams?.type,
    messageParams?.name,
    messageParams?.flow_name,
    messageParams?.action?.name,
  ].map((value) => `${value || ''}`.toLowerCase())

  return markers.includes('order_details') || markers.includes('review_and_pay') ||
    !!messageParams?.review_and_pay || !!messageParams?.order_details
}

const hasItemizedOrderDetailsShape = (parameters: Record<string, any>) =>
  !!parameters?.reference_id &&
  !!parameters?.currency &&
  !!parameters?.total_amount &&
  Array.isArray(parameters?.payment_settings) &&
  !!parameters?.order

const pixCopyCode = (parameters: Record<string, any>) => {
  const settings = Array.isArray(parameters?.payment_settings) ? parameters.payment_settings : []
  for (const setting of settings) {
    if (!['pix_dynamic_code', 'pix_static_code'].includes(`${setting?.type || ''}`)) continue
    const payment = setting?.[setting.type] || {}
    const code = `${payment?.code || ''}`
    if (code) return code
  }
  return undefined
}

export const withOrderDetailsPixCopyButton = (action: any) => {
  if (`${action?.name || ''}` !== 'review_and_pay') return action
  const code = pixCopyCode(action?.parameters || {})
  if (!code) return action
  const buttons = Array.isArray(action?.buttons) ? action.buttons : []
  const alreadyPresent = buttons.some((button: any) =>
    `${button?.type || ''}` === 'cta_copy' && `${button?.copy_code?.code || ''}` === code,
  )
  if (alreadyPresent) return action
  return {
    ...action,
    buttons: [
      ...buttons,
      {
        type: 'cta_copy',
        copy_code: {
          title: 'Copiar código PIX',
          code,
        },
      },
    ],
  }
}

export const extractOrderDetailsNativeFlow = (nativeFlowMessage: any) => {
  const buttons = Array.isArray(nativeFlowMessage?.buttons) ? nativeFlowMessage.buttons : []
  const reviewAndPay = buttons.find((button: any) => `${button?.name || ''}`.toLowerCase() === 'review_and_pay')

  if (reviewAndPay) {
    return withOrderDetailsPixCopyButton({
      name: 'review_and_pay',
      parameters: parseJsonObject(reviewAndPay.buttonParamsJson) || {},
    })
  }

  const messageParams = parseJsonObject(nativeFlowMessage?.messageParamsJson)
  if (!messageParams) return undefined

  const parameters = orderDetailsParametersFromMessageParams(messageParams)
  if (!parameters) return undefined
  if (!explicitlyIdentifiesOrderDetails(messageParams) && !hasItemizedOrderDetailsShape(parameters)) return undefined

  return withOrderDetailsPixCopyButton({ name: 'review_and_pay', parameters })
}

export const interactiveHeaderForWebhook = (header: any) => {
  if (!header) return undefined
  if (header?.imageMessage?.url) {
    return {
      type: 'image',
      image: {
        link: header.imageMessage.url,
        ...(header.imageMessage.mimetype ? { mime_type: header.imageMessage.mimetype } : {}),
      },
    }
  }
  if (header?.videoMessage?.url) {
    return {
      type: 'video',
      video: {
        link: header.videoMessage.url,
        ...(header.videoMessage.mimetype ? { mime_type: header.videoMessage.mimetype } : {}),
      },
    }
  }
  if (header?.documentMessage?.url) {
    return {
      type: 'document',
      document: {
        link: header.documentMessage.url,
        ...(header.documentMessage.fileName ? { filename: header.documentMessage.fileName } : {}),
        ...(header.documentMessage.mimetype ? { mime_type: header.documentMessage.mimetype } : {}),
      },
    }
  }
  if (header?.title) return { type: 'text', text: header.title }
  return undefined
}
