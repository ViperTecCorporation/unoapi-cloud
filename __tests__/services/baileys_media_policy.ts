import { BAILEYS_MEDIA_POLICY } from '../../src/services/baileys_media_policy'

describe('Baileys media policy', () => {
  test('keeps media validation and retry behavior internal', () => {
    expect(BAILEYS_MEDIA_POLICY).toEqual({
      validateLinkBeforeSend: false,
      retryEnabled: true,
      retryDelaysMs: [1_200, 3_000, 7_000],
    })
    expect(Object.isFrozen(BAILEYS_MEDIA_POLICY.retryDelaysMs)).toBe(true)
  })
})
