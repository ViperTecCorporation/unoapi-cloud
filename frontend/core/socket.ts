import type { QrBroadcast } from '../domain/types.js'

type BroadcastListener = (event: QrBroadcast) => void

interface SocketLike {
  connected?: boolean
  on(event: string, listener: (payload?: unknown) => void): void
  emit(event: string, payload?: unknown): void
}

type SocketFactory = (url: string, options: { path: string }) => SocketLike

declare global {
  interface Window {
    io?: SocketFactory
  }
}

export class SocketBridge {
  private socket?: SocketLike
  private phone = ''
  private listener?: BroadcastListener

  constructor(
    private readonly baseUrl: string,
    private readonly socketFactory: SocketFactory | undefined = window.io,
  ) {}

  subscribe(phone: string, listener: BroadcastListener): void {
    this.phone = phone
    this.listener = listener
    const socket = this.ensureSocket()
    if (!socket) return
    if (socket.connected) socket.emit('subscribe_qr', { phone })
    else socket.on('connect', () => socket.emit('subscribe_qr', { phone }))
  }

  clear(): void {
    this.phone = ''
    this.listener = undefined
  }

  private ensureSocket(): SocketLike | undefined {
    if (this.socket || !this.socketFactory) return this.socket
    this.socket = this.socketFactory(this.baseUrl, { path: '/ws' })
    this.socket.on('broadcast', (payload) => {
      const event = payload as QrBroadcast
      if (!this.phone || `${event?.phone || ''}` !== this.phone) return
      this.listener?.(event)
    })
    return this.socket
  }
}
