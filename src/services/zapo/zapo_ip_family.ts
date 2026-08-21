import { Agent, type AgentConnectOpts } from 'agent-base'
import { lookup as dnsLookup, type LookupOptions } from 'node:dns'
import type { ClientRequest } from 'node:http'
import { connect as connectTls, type ConnectionOptions } from 'node:tls'
import { connect as connectTcp, isIP, type LookupFunction, type TcpNetConnectOpts } from 'node:net'
import type { Duplex } from 'node:stream'
import type { WaClientProxyOptions } from 'zapo-js'

export const ZAPO_IP_FAMILY_POLICIES = ['auto', 'ipv6first', 'ipv4first'] as const

export type ZapoIpFamilyPolicy = (typeof ZAPO_IP_FAMILY_POLICIES)[number]
export type ZapoNetworkChannel = 'ws' | 'mediaUpload' | 'mediaDownload' | 'linkPreview'

export type ZapoIpFamilyEnvironment = {
  network?: string
  chatSocket?: string
  mediaUpload?: string
  mediaDownload?: string
  linkPreview?: string
}

export type ZapoIpFamilyPolicies = Record<ZapoNetworkChannel, ZapoIpFamilyPolicy>

export type ZapoFamilyAgent = NonNullable<WaClientProxyOptions['ws']>
export type ZapoFamilyAgentFactory = (policy: Exclude<ZapoIpFamilyPolicy, 'auto'>) => ZapoFamilyAgent
type ZapoDirectSocketOptions = TcpNetConnectOpts & ConnectionOptions
type ZapoDirectSocketFactory = (secure: boolean, options: ZapoDirectSocketOptions) => Duplex

const allowedPolicies = new Set<string>(ZAPO_IP_FAMILY_POLICIES)
const familyAgentCache = new Map<Exclude<ZapoIpFamilyPolicy, 'auto'>, ZapoFamilyAgent>()

const resolvePolicy = (value: string | undefined, fallback: ZapoIpFamilyPolicy, variable: string): ZapoIpFamilyPolicy => {
  const normalized = `${value || ''}`.trim().toLowerCase()
  if (!normalized) return fallback
  if (allowedPolicies.has(normalized)) return normalized as ZapoIpFamilyPolicy
  throw new Error(`${variable} must be one of: ${ZAPO_IP_FAMILY_POLICIES.join(', ')}`)
}

export const resolveZapoIpFamilyPolicies = (environment: ZapoIpFamilyEnvironment = {}): ZapoIpFamilyPolicies => {
  const globalPolicy = resolvePolicy(environment.network, 'auto', 'ZAPO_NETWORK_IP_FAMILY')
  return {
    ws: resolvePolicy(environment.chatSocket, globalPolicy, 'ZAPO_CHAT_SOCKET_IP_FAMILY'),
    mediaUpload: resolvePolicy(environment.mediaUpload, globalPolicy, 'ZAPO_MEDIA_UPLOAD_IP_FAMILY'),
    mediaDownload: resolvePolicy(environment.mediaDownload, globalPolicy, 'ZAPO_MEDIA_DOWNLOAD_IP_FAMILY'),
    linkPreview: resolvePolicy(environment.linkPreview, globalPolicy, 'ZAPO_LINK_PREVIEW_IP_FAMILY'),
  }
}

export const createZapoOrderedLookup = (
  policy: Exclude<ZapoIpFamilyPolicy, 'auto'>,
  resolver: LookupFunction = dnsLookup as LookupFunction,
): LookupFunction =>
  (hostname, options, callback) => {
    const lookupOptions: LookupOptions = {
      ...options,
      order: policy,
    }
    resolver(hostname, lookupOptions, callback)
  }

const createDirectSocket: ZapoDirectSocketFactory = (secure, options) =>
  secure ? connectTls(options) : connectTcp(options)

/** Supports HTTP, HTTPS and WSS while keeping DNS order scoped to one Zapo channel. */
export class ZapoDualProtocolFamilyAgent extends Agent {
  constructor(
    readonly policy: Exclude<ZapoIpFamilyPolicy, 'auto'>,
    private readonly socketFactory: ZapoDirectSocketFactory = createDirectSocket,
    private readonly resolver: LookupFunction = dnsLookup as LookupFunction,
  ) {
    super({ keepAlive: true })
  }

  connect(_request: ClientRequest, options: AgentConnectOpts): Duplex {
    const { secureEndpoint, protocol: _protocol, ...connectionOptions } = options
    const host = `${connectionOptions.host || ''}`
    const servername = (connectionOptions as ConnectionOptions).servername
    return this.socketFactory(secureEndpoint, {
      ...connectionOptions,
      lookup: createZapoOrderedLookup(this.policy, this.resolver),
      family: 0,
      autoSelectFamily: true,
      ...(secureEndpoint && host && !isIP(host) && !servername ? { servername: host } : {}),
    })
  }
}

export const createZapoFamilyAgent = (policy: Exclude<ZapoIpFamilyPolicy, 'auto'>): ZapoFamilyAgent =>
  familyAgentCache.get(policy) || (() => {
    const agent = new ZapoDualProtocolFamilyAgent(policy) as unknown as ZapoFamilyAgent
    familyAgentCache.set(policy, agent)
    return agent
  })()
