import request from 'supertest'
import { mock } from 'jest-mock-extended'

import { Incoming } from '../../src/services/incoming'
import { Outgoing } from '../../src/services/outgoing'
import { defaultConfig, getConfig } from '../../src/services/config'
import { SessionStore } from '../../src/services/session_store'
import { OnNewLogin } from '../../src/services/socket'
import { addToBlacklist } from '../../src/services/blacklist'
import { Reload } from '../../src/services/reload'
import { Logout } from '../../src/services/logout'

type LoadedApp = {
  app: any
  incoming: any
  outgoing: any
  redis: {
    redisKeys: jest.Mock
    getGroup: jest.Mock
    getContactName: jest.Mock
    getContactInfo: jest.Mock
    getLidForPn: jest.Mock
    getPnForLid: jest.Mock
    getProfilePicture: jest.Mock
    setGroup: jest.Mock
  }
}

const addToBlacklistMock = mock<addToBlacklist>()
const sessionStore = mock<SessionStore>()
const getConfigTest: getConfig = async (_phone: string) => defaultConfig

const loadApp = async (metaGroupsEnabled: boolean): Promise<LoadedApp> => {
  jest.resetModules()

  jest.doMock('../../src/defaults', () => {
    const actual = jest.requireActual('../../src/defaults')
    return {
      __esModule: true,
      ...actual,
      UNOAPI_META_GROUPS_ENABLED: metaGroupsEnabled,
    }
  })

  jest.doMock('../../src/services/rate_limit', () => ({
    allowSend: jest.fn().mockResolvedValue({ allowed: true }),
  }))

  jest.doMock('../../src/services/redis', () => ({
    __esModule: true,
    BASE_KEY: 'unoapi-',
    redisKeys: jest.fn(),
    getGroup: jest.fn(),
    getContactName: jest.fn(),
    getContactInfo: jest.fn(),
    getLidForPn: jest.fn(),
    getPnForLid: jest.fn(),
    getProfilePicture: jest.fn(),
    setGroup: jest.fn(),
  }))

  // Require after doMock so defaults/redis are evaluated with this test's flag.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { App } = require('../../src/app')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const redis = require('../../src/services/redis')
  const incoming = mock<Incoming>()
  const outgoing = mock<Outgoing>()
  const onNewLogin = mock<OnNewLogin>()
  const reload = mock<Reload>()
  const logout = mock<Logout>()
  const app = new App(incoming, outgoing, '', getConfigTest, sessionStore, onNewLogin, addToBlacklistMock, reload, logout)

  return {
    app,
    incoming,
    outgoing,
    redis: redis as any,
  }
}

const cachedGroup = {
  subject: 'Equipe Comercial',
  desc: 'Grupo do time comercial',
  creation: 1710000000,
  memberAddMode: true,
  profilePicture: 'https://cdn.exemplo.com/groups/120363040468224422.jpg',
  participants: [
    {
      id: '556699999999@s.whatsapp.net',
      lid: '123456789012345@lid',
      username: '@maria.vendas',
      admin: 'admin',
    },
    {
      id: '556688888888@s.whatsapp.net',
    },
  ],
}

describe('groups routes', () => {
  afterEach(() => {
    jest.dontMock('../../src/defaults')
    jest.dontMock('../../src/services/redis')
    jest.dontMock('../../src/services/rate_limit')
  })

  test('list keeps legacy shape when meta group flag is disabled', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(false)
    redis.redisKeys.mockResolvedValue([`unoapi-group:${phone}:${groupJid}`])
    redis.getGroup.mockResolvedValue(cachedGroup)

    const res = await request(app.server).get(`/v15.0/${phone}/groups`)

    expect(res.status).toEqual(200)
    expect(res.body).toEqual({
      phone,
      groups: [
        {
          jid: groupJid,
          subject: cachedGroup.subject,
          participantsCount: 2,
        },
      ],
    })
  })

  test('details route stays disabled when meta group flag is disabled', async () => {
    const { app } = await loadApp(false)

    const res = await request(app.server).get('/v15.0/556600000000/groups/120363040468224422@g.us')

    expect(res.status).toEqual(404)
    expect(res.body).toEqual({ error: 'meta group routes disabled' })
  })

  test('list returns Meta-like group shape when flag is enabled', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(true)
    redis.redisKeys.mockResolvedValue([`unoapi-group:${phone}:${groupJid}`])
    redis.getGroup.mockResolvedValue(cachedGroup)
    redis.getProfilePicture.mockResolvedValue('')

    const res = await request(app.server).get(`/v15.0/${phone}/groups`)

    expect(res.status).toEqual(200)
    expect(res.body).toEqual({
      phone,
      groups: [
        expect.objectContaining({
          id: groupJid,
          jid: groupJid,
          subject: cachedGroup.subject,
          description: cachedGroup.desc,
          picture: cachedGroup.profilePicture,
          participants_count: 2,
          total_participant_count: 2,
          join_approval_mode: 'approval_required',
          suspended: false,
          creation_timestamp: '1710000000',
        }),
      ],
      paging: {
        cursors: {
          before: null,
          after: null,
        },
      },
    })
  })

  test('details returns participants only when requested by fields', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(true)
    redis.getGroup.mockResolvedValue(cachedGroup)
    redis.getContactName.mockImplementation(async (_phone: string, jid: string) => {
      if (jid === '556699999999@s.whatsapp.net') return 'Maria'
      if (jid === '556688888888@s.whatsapp.net') return 'Joao'
      return ''
    })
    redis.getProfilePicture.mockImplementation(async (_phone: string, jid: string) => {
      if (jid === '556699999999@s.whatsapp.net') return 'https://cdn.exemplo.com/profile/maria.jpg'
      return ''
    })

    const res = await request(app.server).get(
      `/v15.0/${phone}/groups/${groupJid}?fields=id,subject,participants,total_participant_count`
    )

    expect(res.status).toEqual(200)
    expect(res.body).toEqual(expect.objectContaining({
      id: groupJid,
      subject: cachedGroup.subject,
      total_participant_count: 2,
      participants: [
        {
          jid: '556699999999',
          wa_id: '556699999999',
          name: 'Maria',
          user_id: '123456789012345@lid',
          username: '@maria.vendas',
          picture: 'https://cdn.exemplo.com/profile/maria.jpg',
          lid: '123456789012345@lid',
          is_admin: true,
          role: 'admin',
        },
        {
          jid: '556688888888',
          wa_id: '556688888888',
          name: 'Joao',
          is_admin: false,
          role: 'member',
        },
      ],
    }))
  })

  test('participants route returns Meta-like participant payload when flag is enabled', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(true)
    redis.getGroup.mockResolvedValue(cachedGroup)
    redis.getContactName.mockResolvedValue('')
    redis.getProfilePicture.mockResolvedValue('')

    const res = await request(app.server).get(`/v15.0/${phone}/groups/${groupJid}/participants`)

    expect(res.status).toEqual(200)
    expect(res.body).toEqual({
      phone,
      group: {
        id: groupJid,
        jid: groupJid,
        subject: cachedGroup.subject,
        picture: cachedGroup.profilePicture,
      },
      participants: [
        {
          jid: '556699999999',
          wa_id: '556699999999',
          name: '@maria.vendas',
          user_id: '123456789012345@lid',
          username: '@maria.vendas',
          lid: '123456789012345@lid',
          is_admin: true,
          role: 'admin',
        },
        {
          jid: '556688888888',
          wa_id: '556688888888',
          name: '556688888888',
          is_admin: false,
          role: 'member',
        },
      ],
      total_participant_count: 2,
    })
    expect(redis.getProfilePicture).toHaveBeenCalledWith(phone, groupJid)
    expect(redis.getProfilePicture).not.toHaveBeenCalledWith(phone, '556699999999@s.whatsapp.net')
  })

  test('participants route includes participant pictures only when requested', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(true)
    redis.getGroup.mockResolvedValue(cachedGroup)
    redis.getContactName.mockResolvedValue('')
    redis.getProfilePicture.mockImplementation(async (_phone: string, jid: string) => {
      if (jid === groupJid) return cachedGroup.profilePicture
      if (jid === '556699999999@s.whatsapp.net') return 'https://cdn.exemplo.com/profile/maria.jpg'
      return ''
    })

    const res = await request(app.server).get(`/v15.0/${phone}/groups/${groupJid}/participants?include_pictures=true`)

    expect(res.status).toEqual(200)
    expect(res.body.participants[0]).toEqual(expect.objectContaining({
      picture: 'https://cdn.exemplo.com/profile/maria.jpg',
    }))
    expect(redis.getProfilePicture).toHaveBeenCalledWith(phone, '556699999999@s.whatsapp.net')
  })

  test('participants route keeps wa_id blank for LID-only participants', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(true)
    redis.getGroup.mockResolvedValue({
      subject: cachedGroup.subject,
      participants: [
        {
          lid: '777777777777777@lid',
          username: '@lid.only',
        },
      ],
    })

    const res = await request(app.server).get(`/v15.0/${phone}/groups/${groupJid}/participants`)

    expect(res.status).toEqual(200)
    expect(res.body.participants).toEqual([
      expect.objectContaining({
        jid: '777777777777777@lid',
        wa_id: '',
        user_id: '777777777777777@lid',
        username: '@lid.only',
        name: '@lid.only',
      }),
    ])
    expect(res.body.total_participant_count).toEqual(1)
  })

  test('participants route returns Meta-like 404 payload when group is not cached', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, redis } = await loadApp(true)
    redis.getGroup.mockResolvedValue(undefined)

    const res = await request(app.server).get(`/v15.0/${phone}/groups/${groupJid}/participants`)

    expect(res.status).toEqual(404)
    expect(res.body).toEqual({
      error: 'group not found in cache',
      group_id: groupJid,
    })
  })

  test('create group calls Baileys management and emits lifecycle webhook', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, incoming, outgoing, redis } = await loadApp(true)
    incoming.groupCreate = jest.fn().mockResolvedValue({ id: groupJid, subject: 'Equipe Comercial' })
    incoming.groupUpdateDescription = jest.fn().mockResolvedValue(undefined)
    incoming.groupJoinApprovalMode = jest.fn().mockResolvedValue(undefined)
    incoming.groupInviteCode = jest.fn().mockResolvedValue('abc123')
    outgoing.send.mockResolvedValue(undefined)

    const res = await request(app.server)
      .post(`/v15.0/${phone}/groups`)
      .send({
        subject: 'Equipe Comercial',
        description: 'Grupo do time comercial',
        join_approval_mode: 'approval_required',
        participants: ['556699999999', '556688888888'],
      })

    expect(res.status).toEqual(200)
    expect(incoming.groupCreate).toHaveBeenCalledWith(phone, 'Equipe Comercial', [
      '556699999999@s.whatsapp.net',
      '556688888888@s.whatsapp.net',
    ])
    expect(incoming.groupUpdateDescription).toHaveBeenCalledWith(phone, groupJid, 'Grupo do time comercial')
    expect(incoming.groupJoinApprovalMode).toHaveBeenCalledWith(phone, groupJid, 'on')
    expect(redis.setGroup).toHaveBeenCalledWith(phone, groupJid, expect.objectContaining({ id: groupJid, desc: 'Grupo do time comercial' }))
    expect(res.body).toEqual(expect.objectContaining({
      id: groupJid,
      subject: 'Equipe Comercial',
      description: 'Grupo do time comercial',
      join_approval_mode: 'approval_required',
      invite_link: 'https://chat.whatsapp.com/abc123',
      participants: [
        { wa_id: '556699999999', status: 'invited' },
        { wa_id: '556688888888', status: 'invited' },
      ],
    }))
    expect(outgoing.send).toHaveBeenCalledWith(phone, expect.objectContaining({
      object: 'whatsapp_business_account',
      entry: [expect.objectContaining({
        changes: [expect.objectContaining({
          field: 'group_lifecycle_update',
          value: expect.objectContaining({ group_id: groupJid, event: 'created' }),
        })],
      })],
    }))
  })

  test('update group applies settings and emits settings webhook', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, incoming, outgoing } = await loadApp(true)
    incoming.groupUpdateSubject = jest.fn().mockResolvedValue(undefined)
    incoming.groupUpdateDescription = jest.fn().mockResolvedValue(undefined)
    incoming.groupUpdatePicture = jest.fn().mockResolvedValue(undefined)
    incoming.groupJoinApprovalMode = jest.fn().mockResolvedValue(undefined)
    incoming.groupSettingUpdate = jest.fn().mockResolvedValue(undefined)
    outgoing.send.mockResolvedValue(undefined)

    const res = await request(app.server)
      .post(`/v15.0/${phone}/groups/${groupJid}`)
      .send({
        subject: 'Novo nome do grupo',
        description: 'Nova descricao',
        picture: { url: 'https://cdn.exemplo.com/groups/new.jpg' },
        join_approval_mode: 'open',
        announcement: true,
        locked: true,
      })

    expect(res.status).toEqual(200)
    expect(incoming.groupUpdateSubject).toHaveBeenCalledWith(phone, groupJid, 'Novo nome do grupo')
    expect(incoming.groupUpdateDescription).toHaveBeenCalledWith(phone, groupJid, 'Nova descricao')
    expect(incoming.groupUpdatePicture).toHaveBeenCalledWith(phone, groupJid, 'https://cdn.exemplo.com/groups/new.jpg')
    expect(incoming.groupJoinApprovalMode).toHaveBeenCalledWith(phone, groupJid, 'off')
    expect(incoming.groupSettingUpdate).toHaveBeenCalledWith(phone, groupJid, 'announcement')
    expect(incoming.groupSettingUpdate).toHaveBeenCalledWith(phone, groupJid, 'locked')
    expect(res.body).toEqual(expect.objectContaining({
      id: groupJid,
      subject: 'Novo nome do grupo',
      description: 'Nova descricao',
      picture: 'https://cdn.exemplo.com/groups/new.jpg',
      join_approval_mode: 'open',
      announcement: true,
      locked: true,
      updated: true,
    }))
    expect(outgoing.send).toHaveBeenCalledWith(phone, expect.objectContaining({
      entry: [expect.objectContaining({
        changes: [expect.objectContaining({
          field: 'group_settings_update',
          value: expect.objectContaining({
            group_id: groupJid,
            changes: expect.objectContaining({ subject: 'Novo nome do grupo' }),
          }),
        })],
      })],
    }))
  })

  test('remove participants calls Baileys and emits participants webhook', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, incoming, outgoing, redis } = await loadApp(true)
    incoming.groupParticipantsUpdate = jest.fn().mockResolvedValue([{ status: '200', jid: '556699999999@s.whatsapp.net' }])
    redis.getLidForPn.mockResolvedValue('123456789012345@lid')
    outgoing.send.mockResolvedValue(undefined)

    const res = await request(app.server)
      .delete(`/v15.0/${phone}/groups/${groupJid}/participants`)
      .send({ participants: ['556699999999'] })

    expect(res.status).toEqual(200)
    expect(incoming.groupParticipantsUpdate).toHaveBeenCalledWith(phone, groupJid, ['556699999999@s.whatsapp.net'], 'remove')
    expect(res.body).toEqual({ group_id: groupJid, removed: ['556699999999'], failed: [] })
    expect(outgoing.send).toHaveBeenCalledWith(phone, expect.objectContaining({
      entry: [expect.objectContaining({
        changes: [expect.objectContaining({
          field: 'group_participants_update',
          value: expect.objectContaining({ group_id: groupJid, action: 'remove', participants: [{ wa_id: '556699999999', user_id: '123456789012345@lid' }] }),
        })],
      })],
    }))
  })

  test('invite link get and reset use Baileys invite APIs', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, incoming } = await loadApp(true)
    incoming.groupInviteCode = jest.fn().mockResolvedValue('old123')
    incoming.groupRevokeInvite = jest.fn().mockResolvedValue('new456')

    const getRes = await request(app.server).get(`/v15.0/${phone}/groups/${groupJid}/invite_link`)
    const postRes = await request(app.server).post(`/v15.0/${phone}/groups/${groupJid}/invite_link`)

    expect(getRes.status).toEqual(200)
    expect(getRes.body).toEqual({ group_id: groupJid, invite_link: 'https://chat.whatsapp.com/old123' })
    expect(postRes.status).toEqual(200)
    expect(postRes.body).toEqual({ group_id: groupJid, invite_link: 'https://chat.whatsapp.com/new456', reset: true })
  })

  test('join requests list approve and reject map Baileys calls', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, incoming, outgoing } = await loadApp(true)
    incoming.groupRequestParticipantsList = jest.fn().mockResolvedValue([{ jid: '556677777777@s.whatsapp.net', lid: '987654321012345@lid', username: '@cliente.teste', request_time: '1710000300' }])
    incoming.groupRequestParticipantsUpdate = jest.fn().mockResolvedValue([{ status: '200', jid: '556677777777@s.whatsapp.net' }])
    outgoing.send.mockResolvedValue(undefined)

    const listRes = await request(app.server).get(`/v15.0/${phone}/groups/${groupJid}/join_requests`)
    const approveRes = await request(app.server).post(`/v15.0/${phone}/groups/${groupJid}/join_requests`).send({ participants: ['556677777777'] })
    const rejectRes = await request(app.server).delete(`/v15.0/${phone}/groups/${groupJid}/join_requests`).send({ participants: ['556677777777'] })

    expect(listRes.status).toEqual(200)
    expect(listRes.body).toEqual({
      group_id: groupJid,
      join_requests: [{ wa_id: '556677777777', user_id: '987654321012345@lid', username: '@cliente.teste', name: '@cliente.teste', requested_at: '1710000300' }],
    })
    expect(incoming.groupRequestParticipantsUpdate).toHaveBeenCalledWith(phone, groupJid, ['556677777777@s.whatsapp.net'], 'approve')
    expect(incoming.groupRequestParticipantsUpdate).toHaveBeenCalledWith(phone, groupJid, ['556677777777@s.whatsapp.net'], 'reject')
    expect(approveRes.body).toEqual({ group_id: groupJid, approved: ['556677777777'], failed: [] })
    expect(rejectRes.body).toEqual({ group_id: groupJid, rejected: ['556677777777'], failed: [] })
  })

  test('destroy group leaves group and emits lifecycle webhook', async () => {
    const phone = '556600000000'
    const groupJid = '120363040468224422@g.us'
    const { app, incoming, outgoing } = await loadApp(true)
    incoming.groupLeave = jest.fn().mockResolvedValue(undefined)
    outgoing.send.mockResolvedValue(undefined)

    const res = await request(app.server).delete(`/v15.0/${phone}/groups/${groupJid}`)

    expect(res.status).toEqual(200)
    expect(incoming.groupLeave).toHaveBeenCalledWith(phone, groupJid)
    expect(res.body).toEqual({ group_id: groupJid, deleted: true })
    expect(outgoing.send).toHaveBeenCalledWith(phone, expect.objectContaining({
      entry: [expect.objectContaining({
        changes: [expect.objectContaining({
          field: 'group_lifecycle_update',
          value: expect.objectContaining({ group_id: groupJid, event: 'deleted' }),
        })],
      })],
    }))
  })
})
