import { buildContactSyncPayload, resolveContactFromInfo } from '../../src/jobs/contact_sync'

describe('contact synchronization username enrichment', () => {
  test('uses the direct contact username before the temporal index', () => {
    expect(resolveContactFromInfo(
      '573106677588@s.whatsapp.net',
      { pn: '573106677588', lidJid: '149396209594612@lid', username: '@Direct.Name' },
      { 'lid:149396209594612@lid': 'cached.name' },
    )).toEqual({
      pn: '573106677588',
      name: '',
      username: 'direct.name',
    })
  })

  test('falls back to the Redis LID to username index', () => {
    expect(resolveContactFromInfo(
      '573106677588@s.whatsapp.net',
      { pn: '573106677588', lidJid: '149396209594612:4@lid', name: 'Raul' },
      { 'lid:149396209594612@lid': 'raulasalazart' },
    )).toEqual({
      pn: '573106677588',
      name: 'Raul',
      username: 'raulasalazart',
    })
  })

  test('keeps username inside the contact profile sent by contacts.update', () => {
    const payload = buildContactSyncPayload('5566996269251', [{
      wa_id: '573106677588',
      profile: {
        name: 'Raul',
        phone: '573106677588',
        username: 'raulasalazart',
      },
    }])

    expect(payload.entry[0].changes[0].value.contacts[0].profile.username)
      .toBe('raulasalazart')
  })
})
