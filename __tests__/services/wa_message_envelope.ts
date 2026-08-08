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

  test('leaves non-message payloads unchanged', () => {
    const update = { update: { status: 'READ' } }

    expect(packWaMessage(update)).toBe(update)
    expect(unpackWaMessage(update)).toBe(update)
  })
})
