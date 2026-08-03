import {
  createZapoUnavailableMessage,
} from '../../src/services/zapo/zapo_unavailable_message'

describe('Zapo unavailable messages', () => {
  test.each([
    ['view_once', 'view_once_unavailable'],
    ['hosted', 'hosted_message_unavailable'],
    ['bot', 'hosted_message_unavailable'],
    ['other', 'hosted_message_unavailable'],
  ] as const)('creates the %s placeholder', (kind, expectedParameter) => {
    const key = { id: 'message-1', remoteJid: '123@lid', fromMe: false }

    const message = createZapoUnavailableMessage({
      key,
      kind,
      timestampSeconds: 10,
      pushName: 'Contato',
    })

    expect(message).toEqual({
      key,
      messageTimestamp: 10,
      pushName: 'Contato',
      messageStubType: 'FUTUREPROOF',
      messageStubParameters: [expectedParameter],
    })
  })
})
