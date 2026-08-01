import { SocksProxyAgent } from 'socks-proxy-agent'
import type { WaClientProxyOptions } from 'zapo-js'

type ProxyAgentFactory = (url: string) => WaClientProxyOptions['ws']

const createSocksProxyAgent: ProxyAgentFactory = (url) => new SocksProxyAgent(url)

export const createZapoProxyOptions = (
  proxyUrl?: string,
  createAgent: ProxyAgentFactory = createSocksProxyAgent,
): WaClientProxyOptions | undefined => {
  const url = `${proxyUrl || ''}`.trim()
  if (!url) return undefined

  const agent = createAgent(url)
  return {
    ws: agent,
    mediaUpload: agent,
    mediaDownload: agent,
    linkPreview: agent,
  }
}
