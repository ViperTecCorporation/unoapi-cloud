import { proto, type WaIncomingMessageEvent, type WaStoreSession } from 'zapo-js'
import { encryptAddonPayload, buildAddonAdditionalData, WA_USE_CASE_SECRET_MODIFICATION_TYPES } from 'zapo-js/message'
import { decryptZapoPollVoteWithJidFallback } from '../../src/services/zapo/zapo_poll_addon_decrypt'

const secret = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const iv = Uint8Array.from({ length: 12 }, (_, index) => index + 20)
const targetMessageId = 'poll-parent-1'
const creatorLid = '111111111111@lid'
const voterPhone = '5566999999999@s.whatsapp.net'

const createEvent = async (selectedOptions: Uint8Array[]) => {
  const payload = proto.Message.PollVoteMessage.encode({ selectedOptions }).finish()
  const encPayload = await encryptAddonPayload({
    messageSecret: secret,
    stanzaId: targetMessageId,
    parentMsgOriginalSender: creatorLid,
    modificationSender: voterPhone,
    modificationType: WA_USE_CASE_SECRET_MODIFICATION_TYPES.POLL_VOTE,
    payload,
    iv,
    additionalData: buildAddonAdditionalData(targetMessageId, voterPhone),
  })
  return {
    rawNode: { tag: 'message', attrs: {}, content: [] },
    key: {
      id: 'vote-1',
      remoteJid: '120363@g.us',
      participant: '222222222222@lid',
      participantAlt: voterPhone,
      fromMe: false,
      isGroup: true,
      isBroadcast: false,
      isNewsletter: false,
      senderDevice: 0,
    },
    message: {
      pollUpdateMessage: {
        pollCreationMessageKey: {
          id: targetMessageId,
          remoteJid: '120363@g.us',
          participant: creatorLid,
        },
        vote: { encPayload, encIv: iv },
      },
    },
  } as unknown as WaIncomingMessageEvent
}

const createSession = () => ({
  auth: {
    load: jest.fn().mockResolvedValue({
      meJid: '5566888888888@s.whatsapp.net',
      meLid: '888888888888@lid',
    }),
  },
  messageSecret: {
    get: jest.fn().mockResolvedValue({ secret, senderJid: '5566111111111@s.whatsapp.net' }),
  },
  messages: {
    getById: jest.fn().mockResolvedValue({
      id: targetMessageId,
      threadJid: '120363@g.us',
      senderJid: '5566111111111@s.whatsapp.net',
      participantJid: creatorLid,
      fromMe: false,
      messageBytes: proto.Message.encode({
        pollCreationMessage: {
          name: 'Escolha',
          options: [{ optionName: 'A' }],
          selectableOptionsCount: 1,
        },
      }).finish(),
    }),
  },
}) as unknown as WaStoreSession

describe('decryptZapoPollVoteWithJidFallback', () => {
  test('decrypts with alternate PN voter and LID poll creator candidates', async () => {
    const optionHash = Buffer.from('559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd', 'hex')
    const event = await createEvent([optionHash])

    const result = await decryptZapoPollVoteWithJidFallback(event, createSession())

    expect(result?.decrypted).toEqual(expect.objectContaining({
      kind: 'poll_vote',
      selectedOptionNames: ['A'],
      pollVote: expect.objectContaining({ selectedOptions: [expect.any(Uint8Array)] }),
    }))
  })

  test('preserves an authenticated empty vote as a removal', async () => {
    const event = await createEvent([])

    const result = await decryptZapoPollVoteWithJidFallback(event, createSession())

    expect(result?.decrypted.kind).toBe('poll_vote')
    if (result?.decrypted.kind === 'poll_vote') {
      expect(result.decrypted.pollVote.selectedOptions).toEqual([])
    }
  })

  test('retries the local parent store when write-behind has not persisted the poll yet', async () => {
    const optionHash = Buffer.from('559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd', 'hex')
    const event = await createEvent([optionHash])
    const session = createSession() as any
    const parent = await session.messages.getById(targetMessageId)
    session.messages.getById
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(parent)
    session.messageSecret.get
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ secret, senderJid: '5566111111111@s.whatsapp.net' })

    const result = await decryptZapoPollVoteWithJidFallback(event, session, { attempts: 3, delayMs: 0 })

    expect(result?.decrypted.kind).toBe('poll_vote')
    expect(session.messageSecret.get).toHaveBeenCalledTimes(2)
  })

  test('ignores messages that are not encrypted poll addons', async () => {
    const result = await decryptZapoPollVoteWithJidFallback({
      message: { conversation: 'oi' },
    } as WaIncomingMessageEvent, createSession())

    expect(result).toBeNull()
  })
})
