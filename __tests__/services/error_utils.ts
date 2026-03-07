import { isTransientInfraError } from '../../src/services/error_utils'

describe('isTransientInfraError', () => {
  it('returns true for transient DNS failures', () => {
    expect(isTransientInfraError({ code: 'EAI_AGAIN', message: 'getaddrinfo EAI_AGAIN unoapi-redis' })).toBe(true)
  })

  it('returns true for refused connections', () => {
    expect(isTransientInfraError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:6379' })).toBe(true)
  })

  it('returns false for generic ENOTFOUND outside infra dependencies', () => {
    expect(isTransientInfraError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND example.invalid' })).toBe(false)
  })
})
