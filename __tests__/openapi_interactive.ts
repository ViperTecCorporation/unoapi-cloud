import fs from 'fs'
import YAML from 'yaml'

describe('OpenAPI interactive message examples', () => {
  test('documents CTA URL, call and copy buttons with a matching request schema', () => {
    const spec = YAML.parse(fs.readFileSync('docs/openapi.yaml', 'utf8'))
    const example = spec.paths['/v15.0/{phone}/messages'].post.requestBody
      .content['application/json'].examples.interactiveCtaButtons.value
    const schema = spec.components.schemas.MessageInteractiveCtaButtons
    const buttonVariants = schema.allOf[1].properties.interactive.properties
      .action.properties.buttons.items.oneOf

    expect(example.interactive.action.buttons).toEqual([
      { type: 'cta_url', url: { title: 'Abrir site', link: 'https://facebook.com.br' } },
      { type: 'cta_call', call: { title: 'Ligar', phone_number: '+5511999999999' } },
      { type: 'cta_copy', copy_code: { title: 'ChavePix', code: '0000000055442' } },
    ])
    expect(buttonVariants.map((variant: any) => variant.properties.type.const)).toEqual([
      'cta_url',
      'cta_call',
      'cta_copy',
    ])
    expect(spec.components.schemas.MessageRequest.oneOf).toContainEqual({
      $ref: '#/components/schemas/MessageInteractiveCtaButtons',
    })
  })

  test('documents every standalone checkout with the official simplified order envelope', () => {
    const spec = YAML.parse(fs.readFileSync('docs/openapi.yaml', 'utf8'))
    const examples = spec.paths['/v15.0/{phone}/messages'].post.requestBody
      .content['application/json'].examples
    const expectedPaymentTypes = new Map([
      ['paymentPixDynamicStandalone', 'pix_dynamic_code'],
      ['orderPaymentLink', 'payment_link'],
      ['orderBoletoStandalone', 'boleto'],
      ['orderOneClickStandalone', 'offsite_card_pay'],
    ])

    for (const [exampleName, paymentType] of expectedPaymentTypes) {
      const interactive = examples[exampleName].value.interactive
      expect(interactive.type).toBe('order_details')
      expect(interactive.action.name).toBe('review_and_pay')
      expect(interactive.action.parameters).toEqual(expect.objectContaining({
        reference_id: expect.any(String),
        payment_type: 'br',
        currency: 'BRL',
        total_amount: expect.objectContaining({ value: expect.any(Number), offset: 100 }),
      }))
      expect(interactive.action.parameters.payment_settings[0].type).toBe(paymentType)
      expect(interactive.action.parameters).not.toHaveProperty('order')
      expect(interactive).not.toHaveProperty('header')
    }

    const staticPix = examples.paymentPixStatic.value.interactive
    expect(staticPix.type).toBe('button')
    expect(staticPix.action.buttons[0].payment_setting.type).toBe('pix_static_code')

    const legacyDynamicVariant = spec.components.schemas.MessagePaymentRequest
      .allOf[1].properties.interactive.properties.action.properties.buttons.items.oneOf
      .find((variant: any) => variant.properties?.payment_request)
    expect(legacyDynamicVariant.deprecated).toBe(true)
    expect(legacyDynamicVariant.description).toContain('review_and_pay')
  })

  test('documents payment capture and order completion with the original reference', () => {
    const spec = YAML.parse(fs.readFileSync('docs/openapi.yaml', 'utf8'))
    const examples = spec.paths['/v15.0/{phone}/messages'].post.requestBody
      .content['application/json'].examples
    const captured = examples.orderStatus.value.interactive
    const completed = examples.orderCompleted.value.interactive

    expect(captured).toEqual(expect.objectContaining({
      type: 'order_status',
      action: expect.objectContaining({
        name: 'review_order',
        parameters: expect.objectContaining({
          reference_id: 'boleto-1033239253',
          order: expect.objectContaining({ status: 'processing' }),
          payment: expect.objectContaining({ status: 'captured', timestamp: expect.any(Number) }),
        }),
      }),
    }))
    expect(completed.action.parameters).toEqual(expect.objectContaining({
      reference_id: captured.action.parameters.reference_id,
      order: expect.objectContaining({ status: 'completed' }),
      payment: expect.objectContaining({ status: 'captured' }),
    }))

    const orderDetailsReference = spec.components.schemas.MessageOrderDetails
      .allOf[1].properties.interactive.properties.action.properties.parameters
      .properties.reference_id
    const orderStatusReference = spec.components.schemas.MessageOrderStatus
      .allOf[1].properties.interactive.properties.action.properties.parameters
      .properties.reference_id
    expect(orderDetailsReference).toEqual(expect.objectContaining({
      maxLength: 60,
      pattern: '^[A-Za-z0-9_.-]+$',
    }))
    expect(orderStatusReference).toEqual(expect.objectContaining({
      maxLength: 60,
      pattern: '^[A-Za-z0-9_.-]+$',
    }))
  })
})
