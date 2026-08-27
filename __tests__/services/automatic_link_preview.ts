import { findFirstAutomaticPreviewUrl, normalizeAutomaticLinkPreview } from '../../src/services/messages/automatic_link_preview'

describe('automatic link preview', () => {
  test.each([
    'Veja https://vipertec.com.br/oferta',
    'Acesse http://example.com/path?q=1',
    '(https://github.com/ViperTecCorporation/ViperConnect).',
  ])('preserves a valid HTTP(S) URL: %s', (text) => {
    expect(normalizeAutomaticLinkPreview(text)).toEqual({ text, enabled: true })
  })

  test.each([
    ['Acesse vipertec.com.br/oferta', 'Acesse https://vipertec.com.br/oferta'],
    ['Veja www.example.com.', 'Veja https://www.example.com.'],
    ['Link: github.com/ViperTecCorporation/ViperConnect', 'Link: https://github.com/ViperTecCorporation/ViperConnect'],
  ])('adds HTTPS to a bare domain: %s', (text, expected) => {
    expect(normalizeAutomaticLinkPreview(text)).toEqual({ text: expected, enabled: true })
  })

  test.each([
    'Contato suporte@example.com',
    'Arquivo contrato.pdf',
    'Abra localhost:3000',
    'Servidor http://192.168.0.50/teste',
    'Domínio inválido http://-exemplo.com',
    'Texto comum sem domínio',
  ])('does not enable preview for non-public-domain text: %s', (text) => {
    expect(normalizeAutomaticLinkPreview(text)).toEqual({ text, enabled: false })
  })

  test('returns the same first URL that Zapo will use for the preview', () => {
    expect(findFirstAutomaticPreviewUrl(
      'Veja https://youtube.com/shorts/L-HPPgyJ4SY?feature=share e https://example.com',
    )).toBe('https://youtube.com/shorts/L-HPPgyJ4SY?feature=share')
  })
})
