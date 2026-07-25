import { setLocale } from '../../frontend/core/i18n'
import {
  filterQueuesBySession,
  queueDescriptionKey,
  queueFlowLabelKey,
  queueTooltip,
  queueNeedsAttention,
  renderQueuePurgeModal,
  renderQueuesPage,
} from '../../frontend/pages/queues'

const queues = [
  { name: 'unoapi.incoming.server_1.zapo', messages: 0, messages_ready: 0, messages_unacknowledged: 0, consumers: 4, state: 'running' },
  { name: 'unoapi.incoming.server_1.baileys', messages: 2, messages_ready: 2, messages_unacknowledged: 0, consumers: 0, state: 'running' },
  { name: 'unoapi.outgoing.dead', messages: 3, messages_ready: 3, messages_unacknowledged: 0, consumers: 0, state: 'running' },
]

describe('RabbitMQ queues page', () => {
  afterEach(() => setLocale('pt-BR'))

  test('describes known queue domains', () => {
    expect(queueTooltip('unoapi.outgoing.dead')).toContain('esgotou')
    expect(queueDescriptionKey('unoapi.media')).toContain('mídias')
  })

  test('distinguishes failed API sends from failed inbound WhatsApp events', () => {
    expect(queueFlowLabelKey('unoapi.incoming.server_1.zapo.dead')).toBe('API → WhatsApp')
    expect(queueFlowLabelKey('unoapi.listener.server_1.zapo.dead')).toBe('WhatsApp → Webhooks')
    expect(queueTooltip('unoapi.incoming.server_1.zapo.dead')).toContain('comandos de envio')
    expect(queueTooltip('unoapi.listener.server_1.zapo.dead')).toContain('eventos recebidos')
    expect(queueTooltip('unoapi.listener.server_1.zapo.dead')).toContain('esgotou as tentativas')
  })

  test('marks stopped queues or unattended backlogs in red', () => {
    expect(queueNeedsAttention(queues[0])).toBe(false)
    expect(queueNeedsAttention(queues[1])).toBe(true)
  })

  test('filters engine-specific queues by the selected session', () => {
    expect(filterQueuesBySession(queues, { phone: '5566', server: 'server_1', provider: 'zapo' }).map((queue) => queue.name)).toEqual([
      'unoapi.incoming.server_1.zapo',
      'unoapi.outgoing.dead',
    ])
  })

  test('renders session filter, queue tooltips and green/red state icons', () => {
    const html = renderQueuesPage({
      queues,
      sessions: [{ phone: '5566', label: 'Comercial', server: 'server_1', provider: 'zapo' }],
      sessionPhoneFilter: '',
      query: '',
      loading: false,
      refreshIn: 30,
      visibleLimit: 20,
      selectedQueue: 'unoapi.outgoing.dead',
      messages: [{ exchange: 'unoapi', routing_key: '5566', redelivered: true, message_count: 1, properties: {}, payload: { body: 'oi' } }],
      messagesLoading: false,
      error: '',
    })
    expect(html).toContain('Acompanhamento e inspeção das filas do ViperConnect')
    expect(html).toContain('data-filter="queues-session"')
    expect(html).toContain('data-action="toggle-tooltip"')
    expect(html).toContain('queue-state--healthy')
    expect(html).toContain('queue-state--danger')
    expect(html).toContain('data-action="open-queue-purge"')
  })

  test('renders purge confirmation for one, many or all ready messages', () => {
    const html = renderQueuePurgeModal('unoapi.outgoing.dead')
    expect(html).toContain('value="1"')
    expect(html).toContain('value="50"')
    expect(html).toContain('value="all"')
    expect(html).toContain('Digite o nome da fila para confirmar')
  })

  test('renders the panel in English', () => {
    setLocale('en')
    expect(renderQueuePurgeModal('unoapi.outgoing')).toContain('Clear queue messages')
  })
})
