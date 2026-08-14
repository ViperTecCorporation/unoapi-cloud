import { enrichZapoMessageUsername, zapoMessageSenderLid } from '../../src/services/zapo/zapo_username_enrichment'

describe('Zapo username webhook enrichment', () => {
  test('enriches a direct incoming message from the cached LID', async () => {
    const index = { resolveByLid: jest.fn().mockResolvedValue('raulasalazart') }
    const message = { key: { remoteJid: '149396209594612@lid', fromMe: false } }

    await expect(enrichZapoMessageUsername('session', message, false, index as never))
      .resolves.toBe('raulasalazart')

    expect(message.key).toEqual(expect.objectContaining({ senderUsername: 'raulasalazart' }))
    expect(index.resolveByLid).toHaveBeenCalledWith('session', '149396209594612@lid', expect.any(Number), false)
  })

  test('enriches a group participant without confusing the group JID with the sender', async () => {
    const index = { resolveByLid: jest.fn().mockResolvedValue('maria.vendas') }
    const message = {
      key: {
        remoteJid: '120363@g.us',
        participant: '123:7@lid',
        fromMe: false,
        isGroup: true,
      },
    }

    expect(zapoMessageSenderLid(message)).toBe('123:7@lid')
    await enrichZapoMessageUsername('session', message, true, index as never)

    expect(message.key).toEqual(expect.objectContaining({ participantUsername: 'maria.vendas' }))
    expect(index.resolveByLid).toHaveBeenCalledWith('session', '123:7@lid', expect.any(Number), true)
  })

  test('preserves a username delivered by Zapo and does not read the cache', async () => {
    const index = { resolveByLid: jest.fn() }
    const message = {
      key: {
        remoteJid: '123@lid',
        senderUsername: 'zapo.original',
        fromMe: false,
      },
    }

    await expect(enrichZapoMessageUsername('session', message, false, index as never))
      .resolves.toBe('zapo.original')
    expect(index.resolveByLid).not.toHaveBeenCalled()
  })

  test('does not attach the recipient username to an outgoing message', async () => {
    const index = { resolveByLid: jest.fn().mockResolvedValue('recipient') }
    const message = { key: { remoteJid: '123@lid', fromMe: true } }

    await expect(enrichZapoMessageUsername('session', message, false, index as never))
      .resolves.toBeUndefined()
    expect(index.resolveByLid).not.toHaveBeenCalled()
  })
})
