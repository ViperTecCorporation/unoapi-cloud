import { createHash } from 'crypto'
import { normalizePollAggregateState, pollOptionHash, selectedPollOptionHashes } from '../../src/services/messages/poll_vote_state'

describe('poll vote aggregate state', () => {
  test('matches a real Uint8Array option hash using canonical hexadecimal encoding', () => {
    const hash = createHash('sha256').update('Pizza').digest()
    const options = { [pollOptionHash('Pizza')]: 'Pizza' }

    expect(selectedPollOptionHashes({ selectedOptions: [Uint8Array.from(hash)] }, options)).toEqual([pollOptionHash('Pizza')])
  })

  test('uses decrypted option names when the provider omits binary hashes', () => {
    const options = { [pollOptionHash('Pizza')]: 'Pizza' }

    expect(selectedPollOptionHashes({ selectedOptionNames: ['Pizza'] }, options)).toEqual([pollOptionHash('Pizza')])
  })

  test('migrates legacy option, voter and snapshot hashes without losing counts', () => {
    const legacyHash = createHash('sha256').update('Pizza').digest().toString()
    const canonicalHash = pollOptionHash('Pizza')

    expect(
      normalizePollAggregateState({
        options: { [legacyHash]: 'Pizza' },
        voters: { '123@lid': [legacyHash] },
        snapshotCounts: { [legacyHash]: 2 },
      }),
    ).toEqual({
      options: { [canonicalHash]: 'Pizza' },
      voters: { '123@lid': [canonicalHash] },
      snapshotCounts: { [canonicalHash]: 2 },
    })
  })

  test('returns an empty selection when a voter removes their vote', () => {
    const options = { [pollOptionHash('Pizza')]: 'Pizza' }
    expect(selectedPollOptionHashes({ selectedOptions: [], selectedOptionNames: [] }, options)).toEqual([])
  })
})
