import {
  formatNumber,
  getLocale,
  normalizeLocale,
  setLocale,
  t,
} from '../../frontend/core/i18n'

describe('frontend i18n', () => {
  afterEach(() => setLocale('pt-BR'))

  test('normalizes browser locales to the supported languages', () => {
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('en-GB')).toBe('en')
    expect(normalizeLocale('pt-BR')).toBe('pt-BR')
    expect(normalizeLocale('es')).toBe('pt-BR')
  })

  test('keeps Portuguese as the default language', () => {
    expect(getLocale()).toBe('pt-BR')
    expect(t('Visão geral')).toBe('Visão geral')
    expect(formatNumber(8976)).toBe('8.976')
  })

  test('translates text, interpolation and numbers to English', () => {
    setLocale('en')

    expect(t('Visão geral')).toBe('Overview')
    expect(t('Sessão {phone}', { phone: '5566' })).toBe('Session 5566')
    expect(formatNumber(8976)).toBe('8,976')
  })
})
