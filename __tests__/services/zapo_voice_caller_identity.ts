import type { WaStoreSession } from 'zapo-js'
import {
  confirmedZapoVoicePhone,
  normalizeZapoVoiceCallerName,
  ZapoVoiceCallerIdentityResolver,
} from '../../src/services/zapo/voice/zapo_voice_caller_identity'

const contactStore = (values: Record<string, any>) => ({
  getByJid: jest.fn(async (jid: string) => values[jid] || null),
  getByPhoneNumber: jest.fn(async (phone: string) => values[phone] || null),
}) as unknown as WaStoreSession['contacts']

describe('ZapoVoiceCallerIdentityResolver', () => {
  test('uses the session contact display name before push name and sanitizes header control characters', async () => {
    const contacts = contactStore({
      '123@lid': {
        jid: '123@lid',
        lid: '123@lid',
        phoneNumber: '5566996269251',
        displayName: '  Joao "Cliente"\r\nX-Audit: forged  ',
        pushName: 'Joao Push',
      },
    })

    await expect(new ZapoVoiceCallerIdentityResolver('session-a', contacts).resolve('123@lid')).resolves.toEqual({
      callerPn: '5566996269251',
      callerName: 'Joao "Cliente" X-Audit: forged',
      callerNameSource: 'display_name',
    })
    expect(contacts.getByJid).toHaveBeenCalledWith('123@lid')
    expect(contacts.getByPhoneNumber).toHaveBeenCalledWith('5566996269251')
  })

  test('falls back through push name, session-scoped username and confirmed number', async () => {
    const pushContacts = contactStore({
      '123@lid': { jid: '123@lid', lid: '123@lid', phoneNumber: '5566996269251', pushName: 'Maria' },
    })
    await expect(new ZapoVoiceCallerIdentityResolver('session-a', pushContacts).resolve('123@lid')).resolves.toEqual({
      callerPn: '5566996269251',
      callerName: 'Maria',
      callerNameSource: 'push_name',
    })

    const usernameLookup = jest.fn().mockResolvedValue('maria.silva')
    const usernameContacts = contactStore({
      '123@lid': { jid: '123@lid', lid: '123@lid', phoneNumber: '5566996269251' },
    })
    await expect(new ZapoVoiceCallerIdentityResolver('session-b', usernameContacts, usernameLookup).resolve('123@lid')).resolves.toEqual({
      callerPn: '5566996269251',
      callerName: '@maria.silva',
      callerNameSource: 'username',
    })
    expect(usernameLookup).toHaveBeenCalledWith('session-b', '123@lid')

    await expect(new ZapoVoiceCallerIdentityResolver('session-c', contactStore({})).resolve(
      '5566996269251@s.whatsapp.net',
    )).resolves.toEqual({ callerPn: '5566996269251', callerName: '5566996269251' })
  })

  test('looks up by peer JID before confirmed phone and never exposes a LID as caller PN', async () => {
    const contacts = contactStore({
      '123@lid': { jid: '123@lid', lid: '123@lid' },
      '5566996269251': { jid: '123@lid', lid: '123@lid', phoneNumber: '5566996269251', displayName: 'Contato da agenda' },
    })
    await expect(new ZapoVoiceCallerIdentityResolver('session-a', contacts).resolve(
      '123@lid',
      '5566996269251@s.whatsapp.net',
    )).resolves.toEqual({
      callerPn: '5566996269251',
      callerName: 'Contato da agenda',
      callerNameSource: 'display_name',
    })
    expect((contacts.getByJid as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (contacts.getByPhoneNumber as jest.Mock).mock.invocationCallOrder[0],
    )

    await expect(new ZapoVoiceCallerIdentityResolver('session-a', contactStore({})).resolve(
      '123456789@lid',
      '123456789@lid',
    )).resolves.toEqual({})
  })

  test('retries a late session contact mapping and uses only an explicit session fallback phone', async () => {
    const contacts = contactStore({})
    ;(contacts.getByJid as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ jid: '123@lid', lid: '123@lid', phoneNumber: '5566996269251', pushName: 'Contato tardio' })
    const phoneLookup = jest.fn().mockResolvedValue('5566990000000@s.whatsapp.net')
    const resolver = new ZapoVoiceCallerIdentityResolver(
      'session-a',
      contacts,
      undefined,
      phoneLookup,
      { attempts: 2, delayMs: 0 },
    )

    await expect(resolver.resolve('123@lid')).resolves.toEqual({
      callerPn: '5566996269251',
      callerName: 'Contato tardio',
      callerNameSource: 'push_name',
    })
    expect(phoneLookup).not.toHaveBeenCalled()

    await expect(new ZapoVoiceCallerIdentityResolver(
      'session-b',
      contactStore({}),
      undefined,
      phoneLookup,
    ).resolve('999@lid')).resolves.toEqual({ callerPn: '5566990000000', callerName: '5566990000000' })
    expect(phoneLookup).toHaveBeenLastCalledWith('session-b', '999@lid')
  })

  test('keeps contact names isolated to the supplied session store', async () => {
    const first = new ZapoVoiceCallerIdentityResolver('session-a', contactStore({
      '123@lid': { jid: '123@lid', phoneNumber: '5566996269251', displayName: 'Nome ViperTec' },
    }))
    const second = new ZapoVoiceCallerIdentityResolver('session-b', contactStore({
      '123@lid': { jid: '123@lid', phoneNumber: '5566996269251', displayName: 'Nome Empresa Padrao' },
    }))

    await expect(first.resolve('123@lid')).resolves.toMatchObject({ callerName: 'Nome ViperTec' })
    await expect(second.resolve('123@lid')).resolves.toMatchObject({ callerName: 'Nome Empresa Padrao' })
  })
})

describe('Zapo voice caller identity normalization', () => {
  test('normalizes unicode names, bounds their length and accepts only confirmed PN forms', () => {
    expect(normalizeZapoVoiceCallerName(`Ｍaria\t${'a'.repeat(200)}`)).toBe(`Maria ${'a'.repeat(122)}`)
    expect(confirmedZapoVoicePhone('5566996269251:4@s.whatsapp.net')).toBe('5566996269251')
    expect(confirmedZapoVoicePhone('556699554300@s.whatsapp.net')).toBe('5566999554300')
    expect(confirmedZapoVoicePhone('556635211234@s.whatsapp.net')).toBe('556635211234')
    expect(confirmedZapoVoicePhone('11343495192601@lid')).toBeUndefined()
    expect(confirmedZapoVoicePhone('status@broadcast')).toBeUndefined()
  })
})
