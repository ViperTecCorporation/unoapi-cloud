import { mockDeep } from 'jest-mock-extended'
import type { WaClient, WaStoreSession } from 'zapo-js'
import { ZapoGroups } from '../../src/services/zapo/zapo_groups'
import { downloadGroupPicture } from '../../src/services/zapo/zapo_group_picture'

jest.mock('../../src/services/zapo/zapo_group_picture')

const createSubject = () => {
  const client = mockDeep<WaClient>()
  const store = mockDeep<WaStoreSession>()
  store.contacts.getByJid.mockImplementation(async (jid) => ({
    jid: `${jid}`,
    lid: `${jid}`,
    phoneNumber: `${jid}`.startsWith('lid-2') ? '2' : '1',
    lastUpdatedMs: 1,
  }))
  client.group.queryGroupMetadata.mockResolvedValue({
    id: 'g@g.us',
    descId: 'previous-description-id',
  } as never)
  ;(downloadGroupPicture as jest.Mock).mockResolvedValue(Uint8Array.from([1, 2]))
  return { client, store, groups: new ZapoGroups(client, store) }
}

describe('Zapo groups adapter', () => {
  beforeEach(() => jest.clearAllMocks())

  test('lists groups using the Zapo group coordinator', async () => {
    const { client, groups } = createSubject()

    await groups.list()

    expect(client.group.queryAllGroups).toHaveBeenCalledTimes(1)
  })

  test('creates a group using canonical phone JIDs from the Zapo store', async () => {
    const { client, groups } = createSubject()

    await groups.create('Equipe', ['lid-1@lid'])

    expect(client.group.createGroup).toHaveBeenCalledWith('Equipe', ['1@s.whatsapp.net'])
  })

  test('queries group metadata using the Zapo group coordinator', async () => {
    const { client, groups } = createSubject()

    await groups.metadata('g@g.us')

    expect(client.group.queryGroupMetadata).toHaveBeenCalledWith('g@g.us')
  })

  test('updates the group subject using the Zapo group coordinator', async () => {
    const { client, groups } = createSubject()

    await groups.updateSubject('g@g.us', 'Novo')

    expect(client.group.setSubject).toHaveBeenCalledWith('g@g.us', 'Novo')
  })

  test('updates the group description with its previous description id', async () => {
    const { client, groups } = createSubject()

    await groups.updateDescription('g@g.us', 'Nova descricao')

    expect(client.group.setDescription).toHaveBeenCalledWith('g@g.us', 'Nova descricao', 'previous-description-id')
  })

  test('removes the group description using null', async () => {
    const { client, groups } = createSubject()

    await groups.updateDescription('g@g.us', undefined)

    expect(client.group.setDescription).toHaveBeenCalledWith('g@g.us', null, 'previous-description-id')
  })

  test('downloads and updates the group picture', async () => {
    const { client, groups } = createSubject()

    await groups.updatePicture('g@g.us', 'https://example.test/group.jpg')

    expect(downloadGroupPicture).toHaveBeenCalledWith('https://example.test/group.jpg')
    expect(client.profile.setProfilePicture).toHaveBeenCalledWith(Uint8Array.from([1, 2]), 'g@g.us')
  })

  test('rejects a group picture that cannot be downloaded', async () => {
    const { client, groups } = createSubject()
    ;(downloadGroupPicture as jest.Mock).mockRejectedValue(new Error('Could not download group picture: HTTP 404'))

    await expect(groups.updatePicture('g@g.us', 'https://example.test/missing.jpg'))
      .rejects.toThrow('Could not download group picture: HTTP 404')
    expect(client.profile.setProfilePicture).not.toHaveBeenCalled()
  })

  test('adds participants using canonical phone JIDs from the Zapo store', async () => {
    const { client, groups } = createSubject()

    await groups.updateParticipants('g@g.us', ['lid-1@lid'], 'add')

    expect(client.group.addParticipants).toHaveBeenCalledWith('g@g.us', ['1@s.whatsapp.net'])
  })

  test('removes participants using canonical LIDs', async () => {
    const { client, groups } = createSubject()

    await groups.updateParticipants('g@g.us', ['lid-1@lid'], 'remove')

    expect(client.group.removeParticipants).toHaveBeenCalledWith('g@g.us', ['lid-1@lid'])
  })

  test('promotes participants using canonical LIDs', async () => {
    const { client, groups } = createSubject()

    await groups.updateParticipants('g@g.us', ['lid-1@lid'], 'promote')

    expect(client.group.promoteParticipants).toHaveBeenCalledWith('g@g.us', ['lid-1@lid'])
  })

  test('demotes participants using canonical LIDs', async () => {
    const { client, groups } = createSubject()

    await groups.updateParticipants('g@g.us', ['lid-1@lid'], 'demote')

    expect(client.group.demoteParticipants).toHaveBeenCalledWith('g@g.us', ['lid-1@lid'])
  })

  test('queries the group invite code', async () => {
    const { client, groups } = createSubject()

    await groups.inviteCode('g@g.us')

    expect(client.group.queryInviteCode).toHaveBeenCalledWith('g@g.us')
  })

  test('revokes and returns the new group invite code', async () => {
    const { client, groups } = createSubject()
    client.group.revokeInvite.mockResolvedValue({ code: 'new-code', affectedParticipants: [] })

    await expect(groups.revokeInvite('g@g.us')).resolves.toBe('new-code')
    expect(client.group.revokeInvite).toHaveBeenCalledWith('g@g.us')
  })

  test('queries pending group membership requests', async () => {
    const { client, groups } = createSubject()

    await groups.joinRequests('g@g.us')

    expect(client.group.queryMembershipApprovalRequests).toHaveBeenCalledWith('g@g.us')
  })

  test('approves membership requests using canonical LIDs', async () => {
    const { client, groups } = createSubject()

    await expect(groups.updateJoinRequests('g@g.us', ['lid-1@lid'], 'approve')).resolves.toEqual([
      { jid: 'lid-1@lid', status: 'ok' },
    ])
    expect(client.group.approveMembershipRequests).toHaveBeenCalledWith('g@g.us', ['lid-1@lid'])
  })

  test('rejects membership requests using canonical LIDs', async () => {
    const { client, groups } = createSubject()

    await expect(groups.updateJoinRequests('g@g.us', ['lid-2@lid'], 'reject')).resolves.toEqual([
      { jid: 'lid-2@lid', status: 'ok' },
    ])
    expect(client.group.rejectMembershipRequests).toHaveBeenCalledWith('g@g.us', ['lid-2@lid'])
  })

  test('leaves the group using the Zapo group coordinator', async () => {
    const { client, groups } = createSubject()

    await groups.leave('g@g.us')

    expect(client.group.leaveGroup).toHaveBeenCalledWith(['g@g.us'])
  })

  test.each([
    ['announcement', 'announcement', true],
    ['not_announcement', 'announcement', false],
    ['locked', 'restrict', true],
    ['unlocked', 'restrict', false],
  ] as const)('maps the %s group setting', async (setting, zapoSetting, enabled) => {
    const { client, groups } = createSubject()

    await groups.updateSetting('g@g.us', setting)

    expect(client.group.setSetting).toHaveBeenCalledWith('g@g.us', zapoSetting, enabled)
  })

  test.each([
    ['on', true],
    ['off', false],
  ] as const)('maps membership approval mode %s', async (mode, enabled) => {
    const { client, groups } = createSubject()

    await groups.updateJoinApprovalMode('g@g.us', mode)

    expect(client.group.setSetting).toHaveBeenCalledWith('g@g.us', 'membership_approval_mode', enabled)
  })
})
