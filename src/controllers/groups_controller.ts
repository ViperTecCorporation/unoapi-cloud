import { Request, Response } from 'express'
import { UNOAPI_META_GROUPS_ENABLED } from '../defaults'
import { getContactInfo, getContactName, getGroup, getLidForPn, getPnForLid, getProfilePicture, redisKeys, BASE_KEY, setGroup } from '../services/redis'
import { normalizeGroupId, normalizeParticipantId } from '../services/transformer'
import { Incoming } from '../services/incoming'
import { Outgoing } from '../services/outgoing'

const normalizeGroupJid = (input?: string): string => {
  return normalizeGroupId(`${input || ''}`)
}

const parseContactInfoName = (raw?: string): string | undefined => {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    const name = `${parsed?.name || ''}`.trim()
    return name || undefined
  } catch {
    return undefined
  }
}

const normalizeParticipantJidForResponse = (rawJid?: string): string => {
  return normalizeParticipantId(`${rawJid || ''}`)
}

const normalizeParticipantJidForBaileys = (rawJid?: string): string => {
  const value = `${rawJid || ''}`.trim()
  if (!value) return ''
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@lid')) return value
  const digits = value.replace(/\D/g, '')
  return digits ? `${digits}@s.whatsapp.net` : value
}

const normalizeParticipantsForBaileys = (participants?: any): string[] => {
  return (Array.isArray(participants) ? participants : [])
    .map((participant) => normalizeParticipantJidForBaileys(participant))
    .filter((participant) => !!participant)
}

const isParticipantAdmin = (participant: any): boolean => {
  const admin = `${participant?.admin || ''}`.toLowerCase()
  return admin === 'admin' || admin === 'superadmin' || participant?.isAdmin === true
}

const participantRole = (participant: any): string => {
  if (participant?.role) return `${participant.role}`
  if (isParticipantAdmin(participant)) return 'admin'
  return 'member'
}

const groupDescription = (group: any): string => {
  return `${group?.desc || group?.description || ''}`
}

const groupCreatedAt = (group: any): string | undefined => {
  const raw = group?.creation || group?.creationTimestamp || group?.createdAt
  return typeof raw === 'undefined' || raw === null ? undefined : `${raw}`
}

const groupJoinApprovalMode = (group: any): string | undefined => {
  if (typeof group?.joinApprovalMode !== 'undefined') return `${group.joinApprovalMode}`
  if (typeof group?.memberAddMode !== 'undefined') return group.memberAddMode ? 'approval_required' : 'open'
  return undefined
}

const normalizeJoinApprovalModeForBaileys = (value: any): 'on' | 'off' | undefined => {
  const mode = `${value || ''}`.trim().toLowerCase()
  if (!mode) return undefined
  if (['approval_required', 'required', 'on', 'true', '1'].includes(mode)) return 'on'
  if (['open', 'off', 'false', '0', 'none', 'not_required'].includes(mode)) return 'off'
  return undefined
}

const inviteLinkFromCode = (code?: string): string => {
  const clean = `${code || ''}`.trim()
  return clean ? `https://chat.whatsapp.com/${clean}` : ''
}

const nowTimestamp = () => `${Math.floor(Date.now() / 1000)}`

const managementWebhook = (phone: string, field: string, value: any) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: phone,
      changes: [
        {
          field,
          value,
        },
      ],
    },
  ],
})

const resolveNameForJid = async (phone: string, jid: string): Promise<string> => {
  const clean = `${jid || ''}`.trim()
  if (!clean) return ''
  let name = ''
  try { name = `${await getContactName(phone, clean) || ''}`.trim() } catch {}
  if (!name) {
    try {
      const infoRaw = await getContactInfo(phone, clean)
      name = `${parseContactInfoName(infoRaw) || ''}`.trim()
    } catch {}
  }
  if (name) return name

  if (clean.endsWith('@lid')) {
    try {
      const pnJid = await getPnForLid(phone, clean)
      if (pnJid) return await resolveNameForJid(phone, pnJid)
    } catch {}
  } else if (clean.endsWith('@s.whatsapp.net')) {
    try {
      const lidJid = await getLidForPn(phone, clean)
      if (lidJid) return await resolveNameForJid(phone, lidJid)
    } catch {}
  }
  return ''
}

export class GroupsController {
  private incoming: Incoming
  private outgoing: Outgoing

  constructor(incoming: Incoming, outgoing: Outgoing) {
    this.incoming = incoming
    this.outgoing = outgoing
  }

  private ensureMetaEnabled(res: Response): boolean {
    if (UNOAPI_META_GROUPS_ENABLED) return true
    res.status(404).json({ error: 'meta group routes disabled' })
    return false
  }

  private ensureIncomingMethod<T extends keyof Incoming>(name: T): NonNullable<Incoming[T]> {
    const method = this.incoming[name]
    if (typeof method !== 'function') {
      throw new Error(`group management method unavailable: ${String(name)}`)
    }
    return method as NonNullable<Incoming[T]>
  }

  private async emitManagementWebhook(phone: string, field: string, value: any) {
    await this.outgoing.send(phone, managementWebhook(phone, field, value))
  }

  private async groupPicture(phone: string, groupJid: string, group: any): Promise<string> {
    const cached = await getProfilePicture(phone, groupJid)
    return `${group?.profilePicture || group?.picture || cached || ''}`
  }

  private async formatParticipant(phone: string, participant: any) {
    const sourceJid = `${participant?.id || participant?.jid || participant?.lid || ''}`.trim()
    const jid = normalizeParticipantJidForResponse(sourceJid)
    const pnJid = sourceJid.endsWith('@s.whatsapp.net') ? sourceJid : ''
    const lid = `${participant?.lid || (sourceJid.endsWith('@lid') ? sourceJid : '') || ''}`.trim()
    const waId = jid.endsWith('@lid') && pnJid ? normalizeParticipantId(pnJid) : jid
    const name = await resolveNameForJid(phone, sourceJid)
    const picture = await getProfilePicture(phone, sourceJid)
    return {
      jid,
      wa_id: waId,
      name,
      ...(picture ? { picture } : {}),
      ...(lid ? { lid } : {}),
      is_admin: isParticipantAdmin(participant),
      role: participantRole(participant),
    }
  }

  private async formatGroup(phone: string, groupJid: string, group: any, includeParticipants = false) {
    const participantsRaw: any[] = Array.isArray(group?.participants) ? group.participants : []
    const picture = await this.groupPicture(phone, groupJid, group)
    const formatted: any = {
      id: groupJid,
      jid: groupJid,
      subject: `${group?.subject || ''}`,
      description: groupDescription(group),
      ...(picture ? { picture } : {}),
      participants_count: participantsRaw.length,
      total_participant_count: participantsRaw.length,
      ...(groupJoinApprovalMode(group) ? { join_approval_mode: groupJoinApprovalMode(group) } : {}),
      suspended: !!group?.suspended,
      ...(groupCreatedAt(group) ? { creation_timestamp: groupCreatedAt(group) } : {}),
    }
    if (includeParticipants) {
      formatted.participants = await Promise.all(participantsRaw.map((participant) => this.formatParticipant(phone, participant)))
    }
    return formatted
  }

  // GET /:version/:phone/groups
  async list(req: Request, res: Response) {
    try {
      const phone = `${req.params.phone || ''}`.trim()
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      const pattern = `${BASE_KEY}group:${phone}:*`
      const keys = await redisKeys(pattern)
      const groups = await Promise.all((keys || []).map(async (key) => {
        const groupJid = key.substring(`${BASE_KEY}group:${phone}:`.length)
        const group = await getGroup(phone, groupJid)
        const participants = Array.isArray((group as any)?.participants) ? (group as any).participants : []
        if (UNOAPI_META_GROUPS_ENABLED) {
          return this.formatGroup(phone, groupJid, group)
        }
        return {
          jid: groupJid,
          subject: `${(group as any)?.subject || ''}`,
          participantsCount: participants.length,
        }
      }))
      if (UNOAPI_META_GROUPS_ENABLED) {
        return res.json({
          phone,
          groups,
          paging: {
            cursors: {
              before: null,
              after: null,
            },
          },
        })
      }
      return res.json({ phone, groups })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // POST /:version/:phone/groups
  async create(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const subject = `${req.body?.subject || ''}`.trim()
      const description = `${req.body?.description || ''}`.trim()
      const participants = normalizeParticipantsForBaileys(req.body?.participants)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!subject) return res.status(400).json({ error: 'missing subject' })
      if (!participants.length) return res.status(400).json({ error: 'missing participants' })

      const group = await (this.ensureIncomingMethod('groupCreate') as any)(phone, subject, participants)
      const groupJid = normalizeGroupJid(group?.id || group?.jid)
      if (description && groupJid) {
        await (this.ensureIncomingMethod('groupUpdateDescription') as any)(phone, groupJid, description)
        group.desc = description
      }
      const joinApprovalMode = normalizeJoinApprovalModeForBaileys(req.body?.join_approval_mode)
      if (joinApprovalMode && groupJid) {
        await (this.ensureIncomingMethod('groupJoinApprovalMode') as any)(phone, groupJid, joinApprovalMode)
      }
      try { if (groupJid) await setGroup(phone, groupJid, group as any) } catch {}
      let code = ''
      try {
        code = groupJid ? `${await (this.ensureIncomingMethod('groupInviteCode') as any)(phone, groupJid) || ''}` : ''
      } catch {}
      await this.emitManagementWebhook(phone, 'group_lifecycle_update', {
        group_id: groupJid,
        event: 'created',
        timestamp: nowTimestamp(),
      })
      return res.json({
        id: groupJid,
        subject,
        description,
        ...(joinApprovalMode ? { join_approval_mode: req.body?.join_approval_mode } : {}),
        ...(code ? { invite_link: inviteLinkFromCode(code) } : {}),
        participants: participants.map((participant) => ({
          wa_id: normalizeParticipantJidForResponse(participant),
          status: 'invited',
        })),
      })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // POST /:version/:phone/groups/:groupId
  async update(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupId = `${req.params.groupId || ''}`.trim()
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupId) return res.status(400).json({ error: 'missing groupId param' })
      const groupJid = normalizeGroupJid(groupId)
      const changes: any = {}

      if (typeof req.body?.subject !== 'undefined') {
        const subject = `${req.body.subject || ''}`.trim()
        if (!subject) return res.status(400).json({ error: 'invalid subject' })
        await (this.ensureIncomingMethod('groupUpdateSubject') as any)(phone, groupJid, subject)
        changes.subject = subject
      }
      if (typeof req.body?.description !== 'undefined') {
        const description = `${req.body.description || ''}`.trim()
        await (this.ensureIncomingMethod('groupUpdateDescription') as any)(phone, groupJid, description || undefined)
        changes.description = description
      }
      if (typeof req.body?.picture !== 'undefined') {
        const pictureUrl = `${req.body?.picture?.url || ''}`.trim()
        if (!pictureUrl) return res.status(400).json({ error: 'picture.url is required' })
        await (this.ensureIncomingMethod('groupUpdatePicture') as any)(phone, groupJid, pictureUrl)
        changes.picture = pictureUrl
      }
      const joinApprovalMode = normalizeJoinApprovalModeForBaileys(req.body?.join_approval_mode)
      if (joinApprovalMode) {
        await (this.ensureIncomingMethod('groupJoinApprovalMode') as any)(phone, groupJid, joinApprovalMode)
        changes.join_approval_mode = req.body.join_approval_mode
      }
      if (req.body?.announcement !== undefined) {
        const setting = req.body.announcement ? 'announcement' : 'not_announcement'
        await (this.ensureIncomingMethod('groupSettingUpdate') as any)(phone, groupJid, setting)
        changes.announcement = !!req.body.announcement
      }
      if (req.body?.locked !== undefined) {
        const setting = req.body.locked ? 'locked' : 'unlocked'
        await (this.ensureIncomingMethod('groupSettingUpdate') as any)(phone, groupJid, setting)
        changes.locked = !!req.body.locked
      }
      if (!Object.keys(changes).length) return res.status(400).json({ error: 'no supported group changes provided' })

      await this.emitManagementWebhook(phone, 'group_settings_update', {
        group_id: groupJid,
        changes,
        timestamp: nowTimestamp(),
      })
      return res.json({
        id: groupJid,
        ...changes,
        updated: true,
      })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // GET /:version/:phone/groups/:groupId
  async details(req: Request, res: Response) {
    try {
      if (!UNOAPI_META_GROUPS_ENABLED) return res.status(404).json({ error: 'meta group routes disabled' })
      const phone = `${req.params.phone || ''}`.trim()
      const groupId = `${req.params.groupId || ''}`.trim()
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupId) return res.status(400).json({ error: 'missing groupId param' })
      const groupJid = normalizeGroupJid(groupId)
      const group = await getGroup(phone, groupJid)
      if (!group) return res.status(404).json({ error: 'group not found in cache', group_id: groupJid })
      const fields = `${req.query.fields || ''}`.split(',').map((field) => field.trim()).filter(Boolean)
      const includeParticipants = fields.length === 0 || fields.includes('participants')
      return res.json(await this.formatGroup(phone, groupJid, group, includeParticipants))
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // GET /:version/:phone/groups/:groupId/participants
  async participants(req: Request, res: Response) {
    try {
      const phone = `${req.params.phone || ''}`.trim()
      const groupId = `${req.params.groupId || ''}`.trim()
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupId) return res.status(400).json({ error: 'missing groupId param' })
      const groupJid = normalizeGroupJid(groupId)
      const group = await getGroup(phone, groupJid)
      if (!group) return res.status(404).json(
        UNOAPI_META_GROUPS_ENABLED
          ? { error: 'group not found in cache', group_id: groupJid }
          : { error: 'group not found in cache', groupJid }
      )

      const participantsRaw: any[] = Array.isArray((group as any)?.participants) ? (group as any).participants : []
      if (UNOAPI_META_GROUPS_ENABLED) {
        const picture = await this.groupPicture(phone, groupJid, group)
        const participants = await Promise.all(participantsRaw.map((participant: any) => this.formatParticipant(phone, participant)))
        return res.json({
          phone,
          group: {
            id: groupJid,
            jid: groupJid,
            subject: `${(group as any)?.subject || ''}`,
            ...(picture ? { picture } : {}),
          },
          participants,
        })
      }
      const participants = await Promise.all(participantsRaw.map(async (participant: any) => {
        const sourceJid = `${participant?.id || participant?.jid || participant?.lid || ''}`.trim()
        const name = await resolveNameForJid(phone, sourceJid)
        return {
          jid: normalizeParticipantJidForResponse(sourceJid),
          name,
        }
      }))

      return res.json({
        phone,
        group: {
          jid: groupJid,
          subject: `${(group as any)?.subject || ''}`,
        },
        participants,
      })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // DELETE /:version/:phone/groups/:groupId/participants
  async removeParticipants(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupJid = normalizeGroupJid(req.params.groupId)
      const participants = normalizeParticipantsForBaileys(req.body?.participants)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupJid) return res.status(400).json({ error: 'missing groupId param' })
      if (!participants.length) return res.status(400).json({ error: 'missing participants' })
      const result = await (this.ensureIncomingMethod('groupParticipantsUpdate') as any)(phone, groupJid, participants, 'remove')
      const failed = (result || []).filter((item: any) => `${item?.status || '200'}` !== '200').map((item: any) => normalizeParticipantJidForResponse(item?.jid))
      const removed = participants.map((participant) => normalizeParticipantJidForResponse(participant)).filter((participant) => !failed.includes(participant))
      await this.emitManagementWebhook(phone, 'group_participants_update', {
        group_id: groupJid,
        action: 'remove',
        participants: removed.map((waId) => ({ wa_id: waId })),
        timestamp: nowTimestamp(),
      })
      return res.json({ group_id: groupJid, removed, failed })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // GET /:version/:phone/groups/:groupId/invite_link
  async inviteLink(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupJid = normalizeGroupJid(req.params.groupId)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupJid) return res.status(400).json({ error: 'missing groupId param' })
      const code = await (this.ensureIncomingMethod('groupInviteCode') as any)(phone, groupJid)
      return res.json({ group_id: groupJid, invite_link: inviteLinkFromCode(code) })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // POST /:version/:phone/groups/:groupId/invite_link
  async resetInviteLink(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupJid = normalizeGroupJid(req.params.groupId)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupJid) return res.status(400).json({ error: 'missing groupId param' })
      const code = await (this.ensureIncomingMethod('groupRevokeInvite') as any)(phone, groupJid)
      return res.json({ group_id: groupJid, invite_link: inviteLinkFromCode(code), reset: true })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  // GET /:version/:phone/groups/:groupId/join_requests
  async joinRequests(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupJid = normalizeGroupJid(req.params.groupId)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupJid) return res.status(400).json({ error: 'missing groupId param' })
      const requests = await (this.ensureIncomingMethod('groupRequestParticipantsList') as any)(phone, groupJid)
      const join_requests = await Promise.all((requests || []).map(async (item: any) => {
        const jid = `${item?.jid || item?.id || item?.participant || ''}`.trim()
        return {
          wa_id: normalizeParticipantJidForResponse(jid),
          name: await resolveNameForJid(phone, jid),
          requested_at: `${item?.request_time || item?.requested_at || item?.t || ''}`,
        }
      }))
      return res.json({ group_id: groupJid, join_requests })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  private async updateJoinRequests(req: Request, res: Response, action: 'approve' | 'reject') {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupJid = normalizeGroupJid(req.params.groupId)
      const participants = normalizeParticipantsForBaileys(req.body?.participants)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupJid) return res.status(400).json({ error: 'missing groupId param' })
      if (!participants.length) return res.status(400).json({ error: 'missing participants' })
      const result = await (this.ensureIncomingMethod('groupRequestParticipantsUpdate') as any)(phone, groupJid, participants, action)
      const failed = (result || []).filter((item: any) => `${item?.status || '200'}` !== '200').map((item: any) => normalizeParticipantJidForResponse(item?.jid))
      const processed = participants.map((participant) => normalizeParticipantJidForResponse(participant)).filter((participant) => !failed.includes(participant))
      await this.emitManagementWebhook(phone, 'group_participants_update', {
        group_id: groupJid,
        action,
        participants: processed.map((waId) => ({ wa_id: waId })),
        timestamp: nowTimestamp(),
      })
      return res.json({ group_id: groupJid, [action === 'approve' ? 'approved' : 'rejected']: processed, failed })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }

  async approveJoinRequests(req: Request, res: Response) {
    return this.updateJoinRequests(req, res, 'approve')
  }

  async rejectJoinRequests(req: Request, res: Response) {
    return this.updateJoinRequests(req, res, 'reject')
  }

  // DELETE /:version/:phone/groups/:groupId
  async destroy(req: Request, res: Response) {
    try {
      if (!this.ensureMetaEnabled(res)) return
      const phone = `${req.params.phone || ''}`.trim()
      const groupJid = normalizeGroupJid(req.params.groupId)
      if (!phone) return res.status(400).json({ error: 'missing phone param' })
      if (!groupJid) return res.status(400).json({ error: 'missing groupId param' })
      await (this.ensureIncomingMethod('groupLeave') as any)(phone, groupJid)
      await this.emitManagementWebhook(phone, 'group_lifecycle_update', {
        group_id: groupJid,
        event: 'deleted',
        timestamp: nowTimestamp(),
      })
      return res.json({ group_id: groupJid, deleted: true })
    } catch (e) {
      return res.status(500).json({ error: (e as any)?.message || 'internal_error' })
    }
  }
}
