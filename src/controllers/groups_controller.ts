import { Request, Response } from 'express'
import { UNOAPI_META_GROUPS_ENABLED } from '../defaults'
import { getContactInfo, getContactName, getGroup, getLidForPn, getPnForLid, getProfilePicture, redisKeys, BASE_KEY, setGroup, redisSetIfNotExists, redisDelKey, groupKey } from '../services/redis'
import { normalizeGroupId, normalizeParticipantId } from '../services/transformer'
import { Incoming } from '../services/incoming'
import { Outgoing } from '../services/outgoing'

const normalizeGroupJid = (input?: string): string => {
  return normalizeGroupId(`${input || ''}`)
}

const firstNonEmptyString = (...values: any[]): string | undefined => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

const parseContactInfo = (raw?: string): any => {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

const parseContactInfoName = (raw?: string): string | undefined => {
  const parsed = parseContactInfo(raw)
  const name = `${parsed?.name || ''}`.trim()
  return name || undefined
}

const normalizeParticipantJidForResponse = (rawJid?: string): string => {
  return normalizeParticipantId(`${rawJid || ''}`)
}

const normalizeParticipantPhoneForResponse = (rawJid?: string): string => {
  const value = `${rawJid || ''}`.trim()
  if (!value || value.endsWith('@lid')) return ''
  const normalized = normalizeParticipantId(value)
  return normalized.endsWith('@lid') ? '' : normalized
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

const participantLid = (participant: any, sourceJid = ''): string => {
  return firstNonEmptyString(
    participant?.lid,
    `${sourceJid || ''}`.endsWith('@lid') ? sourceJid : '',
    `${participant?.jid || ''}`.endsWith('@lid') ? participant.jid : '',
    `${participant?.id || ''}`.endsWith('@lid') ? participant.id : '',
  ) || ''
}

const participantUsername = (participant: any, contactInfo?: any): string => {
  return firstNonEmptyString(
    participant?.username,
    participant?.participantUsername,
    participant?.remoteJidUsername,
    participant?.senderUsername,
    contactInfo?.username,
  ) || ''
}

const participantRole = (participant: any): string => {
  if (participant?.role) return `${participant.role}`
  if (isParticipantAdmin(participant)) return 'admin'
  return 'member'
}

const resolveParticipantIdentity = async (phone: string, participant: any) => {
  const rawId = `${participant?.id || participant?.jid || participant?.lid || ''}`.trim()
  const rawPhoneNumber = `${participant?.phoneNumber || participant?.phone_number || participant?.pn || ''}`.trim()
  const sourceJid = rawId || rawPhoneNumber
  let pnJid = rawPhoneNumber.endsWith('@s.whatsapp.net') ? rawPhoneNumber : ''
  if (!pnJid && rawPhoneNumber) {
    const candidate = normalizeParticipantJidForBaileys(rawPhoneNumber)
    if (candidate.endsWith('@s.whatsapp.net')) pnJid = candidate
  }
  if (!pnJid && sourceJid.endsWith('@s.whatsapp.net')) pnJid = sourceJid
  let lid = participantLid(participant, rawId || sourceJid)

  if (!pnJid && sourceJid && !sourceJid.endsWith('@lid')) {
    const candidate = normalizeParticipantJidForBaileys(sourceJid)
    if (candidate.endsWith('@s.whatsapp.net')) pnJid = candidate
  }

  if (!pnJid && lid) {
    try { pnJid = `${await getPnForLid(phone, lid) || ''}`.trim() } catch {}
  }

  if (!lid && pnJid) {
    try { lid = `${await getLidForPn(phone, pnJid) || ''}`.trim() } catch {}
  }

  const waId = normalizeParticipantPhoneForResponse(pnJid || sourceJid)
  return {
    sourceJid,
    pnJid,
    lid,
    waId,
    responseJid: normalizeParticipantJidForResponse(pnJid || sourceJid || lid),
  }
}

const participantDisplayName = (participant: any): string => {
  return firstNonEmptyString(
    participant?.name,
    participant?.notify,
    participant?.verifiedName,
    participant?.pushName,
  ) || ''
}

const resolveParticipantName = async (phone: string, participant: any, pnJid: string, lid: string): Promise<string> => {
  const directName = participantDisplayName(participant)
  if (directName) return directName
  for (const jid of [pnJid, lid]) {
    const clean = `${jid || ''}`.trim()
    if (!clean) continue
    let name = ''
    try { name = `${await getContactName(phone, clean) || ''}`.trim() } catch {}
    if (!name) {
      try {
        const infoRaw = await getContactInfo(phone, clean)
        name = `${parseContactInfoName(infoRaw) || ''}`.trim()
      } catch {}
    }
    if (name) return name
  }
  return ''
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

const queryBoolean = (value: any): boolean => {
  return ['1', 'true', 'yes', 'on'].includes(`${value || ''}`.trim().toLowerCase())
}

const inviteLinkFromCode = (code?: string): string => {
  const clean = `${code || ''}`.trim()
  return clean ? `https://chat.whatsapp.com/${clean}` : ''
}

const nowTimestamp = () => `${Math.floor(Date.now() / 1000)}`
const GROUP_METADATA_REFRESH_THROTTLE_SECONDS = 60
const GROUP_METADATA_REFRESH_TIMEOUT_MS = 5000
const GROUP_PARTICIPANTS_NAME_LOOKUP_LIMIT = 100

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

  private async refreshGroupMetadata(phone: string, groupJid: string): Promise<any | undefined> {
    if (typeof this.incoming.groupMetadata !== 'function') return undefined
    const refreshKey = `${BASE_KEY}group-refresh:${phone}:${groupJid}`
    const acquired = await redisSetIfNotExists(refreshKey, `${Date.now()}`, GROUP_METADATA_REFRESH_THROTTLE_SECONDS)
    if (!acquired) return undefined
    const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), GROUP_METADATA_REFRESH_TIMEOUT_MS))
    const fetched = await Promise.race([
      this.incoming.groupMetadata(phone, groupJid).catch(() => undefined),
      timeout,
    ])
    if (!fetched) return undefined
    try { await redisDelKey(groupKey(phone, groupJid)) } catch {}
    await setGroup(phone, groupJid, fetched as any)
    return fetched
  }

  private async formatParticipant(phone: string, participant: any, options: { includePicture?: boolean, resolveName?: boolean } = {}) {
    const { sourceJid, pnJid, lid, waId, responseJid } = await resolveParticipantIdentity(phone, participant)
    const shouldResolveName = options.resolveName !== false
    let contactInfo: any
    if (shouldResolveName) {
      try { contactInfo = parseContactInfo(await getContactInfo(phone, pnJid || sourceJid || lid)) } catch {}
    }
    const username = participantUsername(participant, contactInfo)
    const resolvedName = shouldResolveName ? await resolveParticipantName(phone, participant, pnJid, lid) : participantDisplayName(participant)
    const name = firstNonEmptyString(resolvedName, username, waId, lid) || ''
    const picture = options.includePicture ? await getProfilePicture(phone, pnJid || sourceJid || lid) : ''
    return {
      jid: responseJid,
      wa_id: waId,
      user_id: lid,
      name,
      ...(username ? { username } : {}),
      ...(picture ? { picture } : {}),
      ...(lid ? { lid } : {}),
      is_admin: isParticipantAdmin(participant),
      role: participantRole(participant),
    }
  }

  private async formatParticipantReference(phone: string, rawJid: string) {
    const { waId, lid } = await resolveParticipantIdentity(phone, { id: rawJid })
    const response: any = { wa_id: waId }
    if (lid) response.user_id = lid
    return response
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
      formatted.participants = await Promise.all(participantsRaw.map((participant) => this.formatParticipant(phone, participant, { includePicture: true })))
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
        participants: await Promise.all(participants.map(async (participant) => ({
          ...(await this.formatParticipantReference(phone, participant)),
          status: 'invited',
        }))),
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
      const cachedGroup = await getGroup(phone, groupJid)
      const cachedParticipants = Array.isArray((cachedGroup as any)?.participants) ? (cachedGroup as any).participants : []
      const shouldRefreshMetadata =
        !cachedGroup ||
        cachedParticipants.length <= GROUP_PARTICIPANTS_NAME_LOOKUP_LIMIT ||
        queryBoolean(req.query.refresh_metadata || req.query.refreshMetadata)
      const group = shouldRefreshMetadata ? await this.refreshGroupMetadata(phone, groupJid) || cachedGroup : cachedGroup
      if (!group) return res.status(404).json(
        UNOAPI_META_GROUPS_ENABLED
          ? { error: 'group not found in cache', group_id: groupJid }
          : { error: 'group not found in cache', groupJid }
      )

      const participantsRaw: any[] = Array.isArray((group as any)?.participants) ? (group as any).participants : []
      const resolveParticipantNames = participantsRaw.length <= GROUP_PARTICIPANTS_NAME_LOOKUP_LIMIT || queryBoolean(req.query.resolve_names || req.query.resolveNames)
      if (UNOAPI_META_GROUPS_ENABLED) {
        const picture = await this.groupPicture(phone, groupJid, group)
        const includeParticipantPictures = queryBoolean(req.query.include_pictures)
        const participants = await Promise.all(participantsRaw.map((participant: any) => this.formatParticipant(phone, participant, { includePicture: includeParticipantPictures, resolveName: resolveParticipantNames })))
        return res.json({
          phone,
          group: {
            id: groupJid,
            jid: groupJid,
            subject: `${(group as any)?.subject || ''}`,
            ...(picture ? { picture } : {}),
          },
          participants,
          total_participant_count: participantsRaw.length,
        })
      }
      const participants = await Promise.all(participantsRaw.map(async (participant: any) => {
        const { pnJid, waId, lid, responseJid } = await resolveParticipantIdentity(phone, participant)
        const resolvedName = resolveParticipantNames ? await resolveParticipantName(phone, participant, pnJid, lid) : participantDisplayName(participant)
        const name = firstNonEmptyString(resolvedName, waId, lid) || ''
        return {
          jid: responseJid,
          wa_id: waId,
          user_id: lid,
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
      const participantRefs = (await Promise.all(participants.map((participant) => this.formatParticipantReference(phone, participant))))
        .filter((_participant, index) => !failed.includes(normalizeParticipantJidForResponse(participants[index])))
      await this.emitManagementWebhook(phone, 'group_participants_update', {
        group_id: groupJid,
        action: 'remove',
        participants: participantRefs,
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
        const lid = participantLid(item, jid)
        let contactInfo: any
        try { contactInfo = parseContactInfo(await getContactInfo(phone, jid)) } catch {}
        const username = participantUsername(item, contactInfo)
        const waId = normalizeParticipantPhoneForResponse(jid)
        const name = firstNonEmptyString(await resolveNameForJid(phone, jid), username, waId, lid) || ''
        return {
          wa_id: waId,
          ...(lid ? { user_id: lid } : {}),
          ...(username ? { username } : {}),
          name,
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
      const participantRefs = (await Promise.all(participants.map((participant) => this.formatParticipantReference(phone, participant))))
        .filter((_participant, index) => !failed.includes(normalizeParticipantJidForResponse(participants[index])))
      await this.emitManagementWebhook(phone, 'group_participants_update', {
        group_id: groupJid,
        action,
        participants: participantRefs,
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
