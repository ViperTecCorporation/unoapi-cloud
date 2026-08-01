import { createHash } from 'node:crypto'
import { mockDeep } from 'jest-mock-extended'
import { proto, type WaIncomingAddonEvent, type WaStoreSession } from 'zapo-js'
import { resolveZapoPollVoteOptionNames } from '../../src/services/zapo/zapo_poll_votes'

const hash = (name: string) => createHash('sha256').update(name, 'utf8').digest()

describe('Zapo poll vote resolver', () => {
  const event = (selectedOptionNames: string[] | null = null) => ({
    key: { id: 'vote-1', remoteJid: '120363@g.us', fromMe: true },
    kind: 'poll_vote',
    targetMessageId: 'poll-1',
    decrypted: {
      kind: 'poll_vote',
      pollVote: { selectedOptions: [hash('Baileys'), hash('Zapo')] },
      selectedOptionNames,
    },
  } as unknown as WaIncomingAddonEvent)

  test('resolves missing option names from the persisted Zapo poll', async () => {
    const session = mockDeep<WaStoreSession>()
    session.messages.getById.mockResolvedValue({
      id: 'poll-1',
      threadJid: '120363@g.us',
      fromMe: true,
      messageBytes: proto.Message.encode({
        pollCreationMessageV3: {
          name: 'Qual lib?',
          options: [{ optionName: 'Baileys' }, { optionName: 'Zapo' }],
        },
      }).finish(),
    })

    await expect(resolveZapoPollVoteOptionNames(event(), session)).resolves.toEqual(
      expect.objectContaining({
        decrypted: expect.objectContaining({ selectedOptionNames: ['Baileys', 'Zapo'] }),
      }),
    )
  })

  test('preserves names already resolved by Zapo without loading the parent', async () => {
    const session = mockDeep<WaStoreSession>()
    const resolved = event(['Zapo'])

    await expect(resolveZapoPollVoteOptionNames(resolved, session)).resolves.toBe(resolved)
    expect(session.messages.getById).not.toHaveBeenCalled()
  })

  test('re-resolves malformed names emitted by Zapo', async () => {
    const session = mockDeep<WaStoreSession>()
    session.messages.getById.mockResolvedValue({
      id: 'poll-1',
      threadJid: '120363@g.us',
      fromMe: true,
      messageBytes: proto.Message.encode({
        pollCreationMessageV3: {
          name: 'Qual lib?',
          options: [{ optionName: 'Baileys' }, { optionName: 'Zapo' }],
        },
      }).finish(),
    })

    await expect(resolveZapoPollVoteOptionNames(event(['', '']), session)).resolves.toEqual(
      expect.objectContaining({
        decrypted: expect.objectContaining({ selectedOptionNames: ['Baileys', 'Zapo'] }),
      }),
    )
  })

  test('keeps the addon unchanged when the parent poll is unavailable', async () => {
    const session = mockDeep<WaStoreSession>()
    session.messages.getById.mockResolvedValue(null)
    const unresolved = event()

    await expect(resolveZapoPollVoteOptionNames(unresolved, session)).resolves.toBe(unresolved)
  })
})
