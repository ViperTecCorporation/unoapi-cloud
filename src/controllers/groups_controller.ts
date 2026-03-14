import { Request, Response } from 'express'
import { getContactInfo, getContactName, getGroup, getLidForPn, getPnForLid, redisKeys, BASE_KEY } from '../services/redis'

const normalizeGroupJid = (input?: string): string => {
  const raw = `${input || ''}`.trim()
  if (!raw) return ''
  if (raw.endsWith('@g.us')) return raw
  const digits = raw.replace(/\D/g, '')
  return digits ? `${digits}@g.us` : raw
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
  const jid = `${rawJid || ''}`.trim()
  if (!jid) return ''
  if (jid.endsWith('@s.whatsapp.net')) {
    return jid.split('@')[0].split(':')[0].replace(/\D/g, '')
  }
  return jid
}

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
        return {
          jid: groupJid,
          subject: `${(group as any)?.subject || ''}`,
          participantsCount: participants.length,
        }
      }))
      return res.json({ phone, groups })
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
      if (!group) return res.status(404).json({ error: 'group not found in cache', groupJid })

      const participantsRaw: any[] = Array.isArray((group as any)?.participants) ? (group as any).participants : []
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
}
