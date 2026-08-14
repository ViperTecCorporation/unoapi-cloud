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

const interactiveButtonForChatwoot = (button: any) => {
  if (!button || typeof button !== 'object' || Array.isArray(button)) return button

  if (`${button.type || ''}` === 'cta_url') {
    const value = button.url && typeof button.url === 'object' ? button.url : {}
    return {
      ...button,
      url: {
        ...value,
        title: value.title || button.text || button.title || button.display_text || '',
        link: value.link || value.url || (typeof button.url === 'string' ? button.url : ''),
      },
    }
  }
  if (`${button.type || ''}` === 'cta_call') {
    const value = button.call && typeof button.call === 'object' ? button.call : {}
    return {
      ...button,
      call: {
        ...value,
        title: value.title || button.text || button.title || button.display_text || '',
        phone_number: value.phone_number || button.phone_number || button.phone || '',
      },
    }
  }
  if (`${button.type || ''}` === 'cta_copy') {
    const value = button.copy_code && typeof button.copy_code === 'object' ? button.copy_code : {}
    return {
      ...button,
      copy_code: {
        ...value,
        title: value.title || button.text || button.title || button.display_text || '',
        code: value.code || (typeof button.copy_code === 'string' ? button.copy_code : button.code || ''),
      },
    }
  }
  if (`${button.type || ''}` === 'reply') {
    const value = button.reply && typeof button.reply === 'object' ? button.reply : {}
    return {
      ...button,
      reply: {
        ...value,
        id: value.id || button.id || button.buttonId || '',
        title: value.title || button.text || button.title || button.display_text || '',
      },
    }
  }
  return button
}

const carouselForChatwoot = (carousel: any) => {
  if (!carousel || typeof carousel !== 'object' || !Array.isArray(carousel.cards)) return carousel
  return {
    ...carousel,
    cards: carousel.cards.map((card: any) => {
      if (!card || typeof card !== 'object') return card
      const action = card.action && typeof card.action === 'object' ? card.action : undefined
      if (!action || !Array.isArray(action.buttons)) return card
      return {
        ...card,
        action: {
          ...action,
          buttons: action.buttons.map(interactiveButtonForChatwoot),
        },
      }
    }),
  }
}

export const interactiveForChatwootWebhook = (interactive: any) => {
  if (!interactive || typeof interactive !== 'object' || Array.isArray(interactive)) return interactive

  const originalAction = interactive.action && typeof interactive.action === 'object'
    ? interactive.action
    : undefined
  const actionWithPixCopy = originalAction
    ? withOrderDetailsPixCopyButton(originalAction)
    : undefined
  const action = originalAction
    ? {
        ...actionWithPixCopy,
        ...(Array.isArray(actionWithPixCopy.buttons)
          ? { buttons: actionWithPixCopy.buttons.map(interactiveButtonForChatwoot) }
          : {}),
        ...(originalAction.carousel
          ? { carousel: carouselForChatwoot(originalAction.carousel) }
          : {}),
      }
    : originalAction

  return {
    ...interactive,
    ...(action ? { action } : {}),
    ...(interactive.carousel ? { carousel: carouselForChatwoot(interactive.carousel) } : {}),
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
