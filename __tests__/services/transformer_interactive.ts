import { interactiveForChatwootWebhook } from '../../src/services/transformer/interactive'

describe('interactive webhook transformer', () => {
  test('normalizes outgoing carousel buttons to the Chatwoot webhook contract', () => {
    const interactive = {
      type: 'carousel',
      action: {
        carousel: {
          cards: [{
            body: { text: 'Plano Profissional' },
            action: {
              buttons: [
                { type: 'cta_url', text: 'Conhecer', url: 'https://example.com/plano' },
                { type: 'cta_call', text: 'Ligar', phone_number: '5566999999999' },
                { type: 'cta_copy', text: 'Copiar', copy_code: 'PROMO10' },
                { type: 'reply', text: 'Escolher', id: 'plano-pro' },
              ],
            },
          }],
        },
      },
    }

    const result = interactiveForChatwootWebhook(interactive)

    expect(result.action.carousel.cards[0].action.buttons).toEqual([
      expect.objectContaining({
        type: 'cta_url',
        url: { title: 'Conhecer', link: 'https://example.com/plano' },
      }),
      expect.objectContaining({
        type: 'cta_call',
        call: { title: 'Ligar', phone_number: '5566999999999' },
      }),
      expect.objectContaining({
        type: 'cta_copy',
        copy_code: { title: 'Copiar', code: 'PROMO10' },
      }),
      expect.objectContaining({
        type: 'reply',
        reply: { title: 'Escolher', id: 'plano-pro' },
      }),
    ])
    expect(interactive.action.carousel.cards[0].action.buttons[0].url)
      .toBe('https://example.com/plano')
  })

  test('keeps already-normalized carousel buttons stable in either carousel location', () => {
    const button = {
      type: 'cta_url',
      url: { title: 'Abrir', link: 'https://example.com' },
    }
    const result = interactiveForChatwootWebhook({
      type: 'carousel',
      carousel: { cards: [{ action: { buttons: [button] } }] },
    })

    expect(result.carousel.cards[0].action.buttons[0]).toEqual(button)
  })
})
