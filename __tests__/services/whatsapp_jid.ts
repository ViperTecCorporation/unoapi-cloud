import {
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidNormalizedUser,
} from '../../src/services/whatsapp_jid'

describe('provider-neutral WhatsApp JID helpers', () => {
  test('normalizes device suffixes and legacy c.us users', () => {
    expect(jidNormalizedUser('556699999999:12@s.whatsapp.net')).toBe(
      '556699999999@s.whatsapp.net',
    )
    expect(jidNormalizedUser('556699999999@c.us')).toBe(
      '556699999999@s.whatsapp.net',
    )
  })

  test('classifies supported JID families', () => {
    expect(isPnUser('1@s.whatsapp.net')).toBe(true)
    expect(isLidUser('1:4@lid')).toBe(true)
    expect(isJidGroup('1@g.us')).toBe(true)
    expect(isJidStatusBroadcast('status@broadcast')).toBe(true)
    expect(isJidBroadcast('123@broadcast')).toBe(true)
    expect(isJidNewsletter('123@newsletter')).toBe(true)
  })
})
