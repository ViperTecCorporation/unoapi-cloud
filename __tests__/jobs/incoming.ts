jest.mock('../../src/amqp', () => ({
  amqpPublish: jest.fn().mockResolvedValue(undefined),
}))

import { mock } from 'jest-mock-extended'

import { IncomingJob } from '../../src/jobs/incoming'
import { Incoming } from '../../src/services/incoming'
import { Outgoing } from '../../src/services/outgoing'
import { defaultConfig, getConfig } from '../../src/services/config'

describe('incoming job', () => {
  test('dispatches group management RPC payloads to the local incoming provider', async () => {
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const getConfigTest: getConfig = async () => ({
      ...defaultConfig,
      server: 'server_1',
    })
    incoming.groupParticipantsUpdate = jest.fn().mockResolvedValue([
      { jid: '556699999999@s.whatsapp.net', status: '200' },
    ])
    const job = new IncomingJob(incoming, outgoing, getConfigTest)

    await expect(job.consume('556600000000', {
      type: 'group_management',
      action: 'groupParticipantsUpdate',
      args: [
        '120363040468224422@g.us',
        ['556699999999@s.whatsapp.net'],
        'remove',
      ],
    })).resolves.toEqual([
      { jid: '556699999999@s.whatsapp.net', status: '200' },
    ])

    expect(incoming.groupParticipantsUpdate).toHaveBeenCalledWith(
      '556600000000',
      '120363040468224422@g.us',
      ['556699999999@s.whatsapp.net'],
      'remove'
    )
  })

  test('rejects unknown group management action', async () => {
    const incoming = mock<Incoming>()
    const outgoing = mock<Outgoing>()
    const getConfigTest: getConfig = async () => ({
      ...defaultConfig,
      server: 'server_1',
    })
    const job = new IncomingJob(incoming, outgoing, getConfigTest)

    await expect(job.consume('556600000000', {
      type: 'group_management',
      action: 'groupDestroyEverything',
      args: [],
    })).rejects.toThrow('Unknown group management action groupDestroyEverything')
  })
})
