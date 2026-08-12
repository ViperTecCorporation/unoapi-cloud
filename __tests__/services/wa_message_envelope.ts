import { packWaMessage, unpackWaMessage } from '../../src/services/wa_message_envelope'

describe('WA message AMQP envelope', () => {
  test('preserves Zapo alternate addressing omitted by WAProto MessageKey', () => {
    const original = {
      key: {
        remoteJid: '11343495192601@lid',
        remoteJidAlt: '5566999554300@s.whatsapp.net',
        id: 'echo-1',
        fromMe: true,
        isGroup: false,
      },
      message: { conversation: 'eco' },
    }

    const unpacked = unpackWaMessage(packWaMessage(original))

    expect(unpacked).toEqual(expect.objectContaining({
      key: expect.objectContaining(original.key),
      message: expect.objectContaining({ conversation: 'eco' }),
    }))
  })

  test('preserves group participant identity and username', () => {
    const original = {
      key: {
        remoteJid: '120363039221813429@g.us',
        participant: '123456789@lid',
        participantAlt: '5566991112222@s.whatsapp.net',
        participantUsername: 'cliente.teste',
        id: 'group-1',
        fromMe: false,
        isGroup: true,
      },
      message: { conversation: 'grupo' },
    }

    const unpacked = unpackWaMessage(packWaMessage(original))

    expect(unpacked.key).toEqual(expect.objectContaining(original.key))
  })

  test('preserves unavailable-message stub parameters', () => {
    const original = {
      key: {
        remoteJid: '120363039221813429@g.us',
        participant: '123456789@lid',
        participantAlt: '5566991112222@s.whatsapp.net',
        id: 'view-once-1',
        fromMe: false,
        isGroup: true,
      },
      messageTimestamp: 10,
      messageStubType: 'FUTUREPROOF',
      messageStubParameters: ['view_once_unavailable'],
    }

    const unpacked = unpackWaMessage(packWaMessage(original))

    expect(unpacked.messageStubParameters).toEqual(['view_once_unavailable'])
    expect(unpacked.key).toEqual(expect.objectContaining(original.key))
  })

  test('preserves the internal Typebot exclusion marker across AMQP', () => {
    const original = {
      key: {
        remoteJid: '5566991112222@s.whatsapp.net',
        id: 'call-webhook-1',
        fromMe: false,
        __unoapiSkipTypebot: true,
      },
      message: { conversation: 'Tentou ligar no WhatsApp' },
    }

    const unpacked = unpackWaMessage(packWaMessage(original))

    expect(unpacked.key.__unoapiSkipTypebot).toBe(true)
  })

  test('preserves decrypted poll selections outside the WAProto encrypted vote schema', () => {
    const selected = Buffer.from('559aead08264d5795d3909718cdd05abd49572e84fe55590eef31a88a08fdffd', 'hex')
    const original = {
      key: {
        remoteJid: '120363039221813429@g.us',
        participant: '123456789@lid',
        id: 'poll-vote-1',
        fromMe: true,
        isGroup: true,
      },
      message: {
        pollUpdateMessage: {
          pollCreationMessageKey: { remoteJid: '120363039221813429@g.us', id: 'poll-1', fromMe: true },
          vote: {
            selectedOptions: [selected],
            selectedOptionNames: ['A'],
          },
        },
      },
    }

    const packedThroughAmqp = JSON.parse(JSON.stringify(packWaMessage(original)))
    const unpacked = unpackWaMessage(packedThroughAmqp)

    expect(unpacked.message.pollUpdateMessage.vote.selectedOptionNames).toEqual(['A'])
    expect(Buffer.from(unpacked.message.pollUpdateMessage.vote.selectedOptions[0]).toString('hex')).toBe(selected.toString('hex'))
  })

  test('leaves non-message payloads unchanged', () => {
    const update = { update: { status: 'READ' } }

    expect(packWaMessage(update)).toBe(update)
    expect(unpackWaMessage(update)).toBe(update)
  })
})
