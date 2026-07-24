import { getZapoRecipientIdentity, getZapoStoredPhone } from '../../src/services/zapo/zapo_recipient'

describe('Zapo recipient identity', () => {
  test('prioritizes the explicit recipient LID over the presentation phone', () => {
    expect(getZapoRecipientIdentity({
      to: '5566996890270',
      user_id: '273877414502425@lid',
    })).toBe('273877414502425@lid')
  })

  test.each([
    ['273877414502425@lid', '273877414502425@lid'],
    ['contato.exemplo', 'contato.exemplo'],
    ['556696890270', '556696890270'],
  ])('accepts %s directly in the public to field', (to, expected) => {
    expect(getZapoRecipientIdentity({ to })).toBe(expected)
  })

  test('does not let an auxiliary identity override an explicit to LID', () => {
    expect(getZapoRecipientIdentity({
      to: '273877414502425@lid',
      user_id: '1100316999680@lid',
    })).toBe('273877414502425@lid')
  })

  test('falls back to the phone when the API does not know the LID', () => {
    expect(getZapoRecipientIdentity({ to: '556696890270' })).toBe('556696890270')
  })

  test('uses username before the phone when no recipient LID is available', () => {
    expect(getZapoRecipientIdentity({
      to: '5566996890270',
      username: 'contato.exemplo',
    })).toBe('contato.exemplo')
  })

  test('returns the exact PN stored for the LID without inserting the ninth digit', async () => {
    const contacts = {
      getByJid: jest.fn().mockResolvedValue({
        jid: '273877414502425@lid',
        phoneNumber: '556696890270@s.whatsapp.net',
      }),
    }

    await expect(getZapoStoredPhone(contacts as never, '273877414502425@lid'))
      .resolves.toBe('556696890270@s.whatsapp.net')
  })
})
