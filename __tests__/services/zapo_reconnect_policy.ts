import { SendError } from '../../src/services/send_error'
import {
  isZapoOwnershipConflict,
  zapoReconnectDelay,
} from '../../src/services/zapo/zapo_reconnect_policy'

describe('Zapo reconnect policy', () => {
  test.each([
    [0, 500, 1_000],
    [1, 2_000, 4_000],
    [8, 2_000, 60_000],
    [-1, 2_000, 2_000],
  ])('calculates bounded exponential delay', (attempt, configuredDelay, expected) => {
    expect(zapoReconnectDelay(attempt, configuredDelay)).toBe(expected)
  })

  test('identifies only Zapo runtime ownership conflicts', () => {
    expect(isZapoOwnershipConflict(
      new SendError(409, 'zapo_session_owned_by_another_worker: 5566999999999'),
    )).toBe(true)
    expect(isZapoOwnershipConflict(new SendError(409, 'zapo_client_not_connected'))).toBe(false)
    expect(isZapoOwnershipConflict(new Error('zapo_session_owned_by_another_worker'))).toBe(false)
  })
})
