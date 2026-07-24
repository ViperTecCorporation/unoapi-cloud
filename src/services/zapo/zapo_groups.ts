import type { WaClient, WaStoreSession } from 'zapo-js'
import { ZapoIdentity } from './zapo_identity'
import { downloadGroupPicture } from './zapo_group_picture'

type ParticipantAction = 'add' | 'remove' | 'promote' | 'demote'
type GroupSetting = 'announcement' | 'not_announcement' | 'locked' | 'unlocked'

export class ZapoGroups {
  private readonly identity: ZapoIdentity

  constructor(private readonly client: WaClient, store: WaStoreSession, phone = '') {
    this.identity = new ZapoIdentity(client, store, phone)
  }

  list() {
    return this.client.group.queryAllGroups()
  }

  async create(subject: string, participants: string[]) {
    return this.client.group.createGroup(subject, await this.identity.resolveManyPhoneJids(participants))
  }

  metadata(jid: string) {
    return this.client.group.queryGroupMetadata(jid)
  }

  updateSubject(jid: string, subject: string) {
    return this.client.group.setSubject(jid, subject)
  }

  async updateDescription(jid: string, description?: string) {
    const metadata: any = await this.client.group.queryGroupMetadata(jid)
    const previousId = `${metadata?.descId || metadata?.descriptionId || ''}`.trim() || undefined
    return this.client.group.setDescription(jid, description || null, previousId)
  }

  async updatePicture(jid: string, pictureUrl: string) {
    await this.client.profile.setProfilePicture(await downloadGroupPicture(pictureUrl), jid)
  }

  async updateParticipants(jid: string, participants: string[], action: ParticipantAction): Promise<readonly unknown[]> {
    const methods = {
      add: this.client.group.addParticipants,
      remove: this.client.group.removeParticipants,
      promote: this.client.group.promoteParticipants,
      demote: this.client.group.demoteParticipants,
    }
    const resolved = action === 'add'
      ? await this.identity.resolveManyPhoneJids(participants)
      : await this.identity.resolveMany(participants)
    return methods[action](jid, resolved)
  }

  inviteCode(jid: string) {
    return this.client.group.queryInviteCode(jid)
  }

  async revokeInvite(jid: string) {
    return (await this.client.group.revokeInvite(jid)).code
  }

  joinRequests(jid: string) {
    return this.client.group.queryMembershipApprovalRequests(jid)
  }

  async updateJoinRequests(jid: string, participants: string[], action: 'approve' | 'reject') {
    const lids = await this.identity.resolveMany(participants)
    if (action === 'approve') await this.client.group.approveMembershipRequests(jid, lids)
    else await this.client.group.rejectMembershipRequests(jid, lids)
    return lids.map((participant) => ({ jid: participant, status: 'ok' }))
  }

  leave(jid: string) {
    return this.client.group.leaveGroup([jid])
  }

  updateSetting(jid: string, setting: GroupSetting) {
    if (setting === 'announcement' || setting === 'not_announcement') {
      return this.client.group.setSetting(jid, 'announcement', setting === 'announcement')
    }
    return this.client.group.setSetting(jid, 'restrict', setting === 'locked')
  }

  updateJoinApprovalMode(jid: string, mode: 'on' | 'off') {
    return this.client.group.setSetting(jid, 'membership_approval_mode', mode === 'on')
  }
}
