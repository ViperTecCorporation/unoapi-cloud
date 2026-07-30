jest.mock('../../src/amqp', () => ({
  amqpPublish: jest.fn().mockResolvedValue(undefined),
  amqpRpc: jest.fn(),
}))

import { IncomingAmqp } from '../../src/services/incoming_amqp'
import { defaultConfig, getConfig } from '../../src/services/config'
import { amqpPublish, amqpRpc } from '../../src/amqp'
import { UNOAPI_EXCHANGE_BRIDGE_NAME, UNOAPI_QUEUE_INCOMING } from '../../src/defaults'

const amqpPublishMock = amqpPublish as jest.MockedFunction<typeof amqpPublish>
const amqpRpcMock = amqpRpc as jest.MockedFunction<typeof amqpRpc>

describe('service incoming amqp', () => {
  beforeEach(() => {
    amqpPublishMock.mockClear()
    amqpRpcMock.mockReset()
  })

  test('send group payload returns Meta-like group contact ids', async () => {
    const phone = '556600000000'
    const getConfigTest: getConfig = async () => ({
      ...defaultConfig,
      server: 'server_1',
      provider: 'zapo',
    })
    const incoming = new IncomingAmqp(getConfigTest)
    const response = await incoming.send(phone, {
      messaging_product: 'whatsapp',
      recipient_type: 'group',
      to: '120363040468224422',
      type: 'text',
      text: {
        body: 'Ola pessoal',
      },
    })

    expect(amqpPublishMock).toHaveBeenCalledTimes(1)
    expect(response.ok).toEqual({
      messaging_product: 'whatsapp',
      contacts: [
        {
          input: '120363040468224422@g.us',
          wa_id: '120363040468224422@g.us',
        },
      ],
      messages: [
        {
          id: expect.any(String),
        },
      ],
    })
  })

  test('group management methods are sent through AMQP RPC to the configured Zapo worker queue', async () => {
    const phone = '556600000000'
    const getConfigTest: getConfig = async () => ({
      ...defaultConfig,
      server: 'server_1',
      provider: 'zapo',
    })
    amqpRpcMock.mockResolvedValueOnce({ id: '120363040468224422@g.us', subject: 'Equipe Comercial' })
    amqpRpcMock.mockResolvedValueOnce('abc123')
    amqpRpcMock.mockResolvedValueOnce({ url: 'https://cdn.example/group.jpg' })
    const incoming = new IncomingAmqp(getConfigTest)

    await expect(incoming.groupCreate(phone, 'Equipe Comercial', ['556699999999@s.whatsapp.net'])).resolves.toEqual({
      id: '120363040468224422@g.us',
      subject: 'Equipe Comercial',
    })
    await expect(incoming.groupInviteCode(phone, '120363040468224422@g.us')).resolves.toEqual('abc123')
    await expect(incoming.groupProfilePicture(phone, '120363040468224422@g.us')).resolves.toEqual({
      url: 'https://cdn.example/group.jpg',
    })

    expect(amqpRpcMock).toHaveBeenNthCalledWith(
      1,
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      `${UNOAPI_QUEUE_INCOMING}.server_1.zapo`,
      phone,
      {
        type: 'group_management',
        action: 'groupCreate',
        args: ['Equipe Comercial', ['556699999999@s.whatsapp.net']],
      },
      {
        type: 'direct',
        priority: 5,
        maxRetries: 0,
      },
    )
    expect(amqpRpcMock).toHaveBeenNthCalledWith(
      2,
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      `${UNOAPI_QUEUE_INCOMING}.server_1.zapo`,
      phone,
      {
        type: 'group_management',
        action: 'groupInviteCode',
        args: ['120363040468224422@g.us'],
      },
      {
        type: 'direct',
        priority: 5,
        maxRetries: 0,
      },
    )
    expect(amqpRpcMock).toHaveBeenNthCalledWith(
      3,
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      `${UNOAPI_QUEUE_INCOMING}.server_1.zapo`,
      phone,
      {
        type: 'group_management',
        action: 'groupProfilePicture',
        args: ['120363040468224422@g.us', false],
      },
      {
        type: 'direct',
        priority: 5,
        maxRetries: 0,
      },
    )
  })

  test('routes contact verification to the Zapo worker selected by the session', async () => {
    const phone = '556600000000'
    const incoming = new IncomingAmqp(async () => ({ ...defaultConfig, server: 'server_2', provider: 'zapo' }))
    amqpRpcMock.mockResolvedValue([{ input: '5566111', wa_id: '111@lid', status: 'valid' }])

    await expect(incoming.contacts(phone, ['5566111'])).resolves.toHaveLength(1)
    expect(amqpRpcMock).toHaveBeenCalledWith(
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      `${UNOAPI_QUEUE_INCOMING}.server_2.zapo`,
      phone,
      { type: 'provider_operation', action: 'contacts', args: [['5566111']] },
      { type: 'direct', priority: 5, maxRetries: 0 },
    )
  })

  test('routes address-book contact creation to the Zapo worker', async () => {
    const phone = '556600000000'
    const incoming = new IncomingAmqp(async () => ({ ...defaultConfig, server: 'server_2', provider: 'zapo' }))
    const input = { phone_number: '5511988887777', full_name: 'Maria Silva' }
    amqpRpcMock.mockResolvedValue({ success: true, contact: input })

    await incoming.saveContact(phone, input)

    expect(amqpRpcMock).toHaveBeenCalledWith(
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      `${UNOAPI_QUEUE_INCOMING}.server_2.zapo`,
      phone,
      { type: 'provider_operation', action: 'saveContact', args: [input] },
      { type: 'direct', priority: 5, maxRetries: 0 },
    )
  })

  test('rejects Baileys operations without publishing to an inactive queue', async () => {
    const incoming = new IncomingAmqp(async () => ({
      ...defaultConfig,
      server: 'server_1',
      provider: 'baileys',
    }))

    await expect(
      incoming.send('5566', {
        type: 'text',
        to: '5577',
        text: { body: 'teste' },
      }),
    ).rejects.toThrow('baileys_provider_disabled_deregister_required')
    expect(amqpPublishMock).not.toHaveBeenCalled()
  })

  test('requests a pairing code from the selected provider worker', async () => {
    const incoming = new IncomingAmqp(async () => ({ ...defaultConfig, server: 'server_2', provider: 'zapo' }))
    amqpRpcMock.mockResolvedValue('1234-5678')
    await expect(incoming.requestPairingCode('5566')).resolves.toBe('1234-5678')
    expect(amqpRpcMock).toHaveBeenCalledWith(
      UNOAPI_EXCHANGE_BRIDGE_NAME,
      `${UNOAPI_QUEUE_INCOMING}.server_2.zapo`,
      '5566',
      { type: 'provider_operation', action: 'requestPairingCode', args: [] },
      { type: 'direct', priority: 5, maxRetries: 0 },
    )
  })
})
