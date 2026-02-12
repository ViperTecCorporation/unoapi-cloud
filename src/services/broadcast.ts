import { Server } from 'socket.io'

export class Broadcast {
  private server: Server
  private lastQrByPhone: Map<string, { content: string; ts: number }> = new Map()
  private static readonly LAST_QR_TTL_MS = 30 * 1000
  private hasBoundSocket = false

  public setSever(server: Server) {
    this.server = server
    this.bindSocketHandlers()
  }

  public async send(phone: string, type: string, content: string) {
    if (!this.server) {
      throw 'Set the socket server'
    }
    if (type === 'qrcode' && phone && content) {
      this.lastQrByPhone.set(phone, { content, ts: Date.now() })
    }
    await this.server.emit('broadcast', { phone, type, content, ts: Date.now(), cached: false })
  }

  private bindSocketHandlers() {
    if (!this.server || this.hasBoundSocket) return
    this.hasBoundSocket = true
    this.server.on('connection', (socket) => {
      socket.on('subscribe_qr', (data: { phone?: string }) => {
        const phone = data?.phone
        if (!phone) return
        const cached = this.lastQrByPhone.get(phone)
        if (!cached) return
        if (Date.now() - cached.ts > Broadcast.LAST_QR_TTL_MS) {
          this.lastQrByPhone.delete(phone)
          return
        }
        socket.emit('broadcast', { phone, type: 'qrcode', content: cached.content, ts: cached.ts, cached: true })
      })
    })
  }
}
  
