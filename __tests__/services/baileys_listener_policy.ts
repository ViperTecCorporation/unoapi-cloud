import { BAILEYS_LISTENER_POLICY } from '../../src/services/baileys_listener_policy'

describe('Baileys listener policy', () => {
  test('keeps listener throttling and deduplication internal', () => {
    expect(BAILEYS_LISTENER_POLICY).toEqual({
      delayBetweenMessagesMs: 0,
      delayAfterFirstMessageMs: 0,
      inboundDedupWindowMs: 7_000,
    })
    expect(Object.isFrozen(BAILEYS_LISTENER_POLICY)).toBe(true)
  })
})
