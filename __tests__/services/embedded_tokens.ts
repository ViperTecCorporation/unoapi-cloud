import { issueEmbeddedAccessToken, isEmbeddedAccessToken } from '../../src/services/embedded_tokens'

describe('service embedded tokens', () => {
  test('issues tokens accepted by validator', () => {
    const token = issueEmbeddedAccessToken('seed')

    expect(token).toMatch(/^uno_emb\./)
    expect(isEmbeddedAccessToken(token)).toBe(true)
  })

  test('rejects tampered tokens', () => {
    const token = issueEmbeddedAccessToken('seed')
    const tampered = token.replace(/.$/, token.endsWith('a') ? 'b' : 'a')

    expect(isEmbeddedAccessToken(tampered)).toBe(false)
  })
})
