import type { ContactDirectoryItem } from './types.js'

type PictureFetcher = (sessionPhone: string, pictureId: string) => Promise<Blob | undefined>

export type ContactPictureLoaderOptions = {
  concurrency?: number
  maxEntries?: number
  positiveTtlMs?: number
  missingTtlMs?: number
  now?: () => number
  createObjectUrl?: (blob: Blob) => string
  revokeObjectUrl?: (url: string) => void
}

export class ContactPictureLoader {
  private readonly urls = new Map<string, { url: string; expiresAt: number }>()
  private readonly missing = new Map<string, number>()
  private readonly pending = new Map<string, Promise<string | undefined>>()
  private readonly concurrency: number
  private readonly maxEntries: number
  private readonly positiveTtlMs: number
  private readonly missingTtlMs: number
  private readonly now: () => number
  private readonly createObjectUrl: (blob: Blob) => string
  private readonly revokeObjectUrl: (url: string) => void

  constructor(
    private readonly fetchPicture: PictureFetcher,
    options: ContactPictureLoaderOptions = {},
  ) {
    this.concurrency = Math.max(1, Math.min(8, options.concurrency || 4))
    this.maxEntries = Math.max(20, options.maxEntries || 500)
    this.positiveTtlMs = Math.max(1_000, options.positiveTtlMs || 60 * 60 * 1_000)
    this.missingTtlMs = Math.max(1_000, options.missingTtlMs || 5 * 60 * 1_000)
    this.now = options.now || (() => Date.now())
    this.createObjectUrl = options.createObjectUrl || ((blob) => URL.createObjectURL(blob))
    this.revokeObjectUrl = options.revokeObjectUrl || ((url) => URL.revokeObjectURL(url))
  }

  async hydrate(sessionPhone: string, contacts: ContactDirectoryItem[]): Promise<void> {
    const queue = contacts.filter((contact) => !!contact.picture_id)
    let next = 0
    const worker = async () => {
      while (next < queue.length) {
        const contact = queue[next++]
        const pictureId = contact.picture_id!
        const url = await this.load(sessionPhone, pictureId).catch(() => undefined)
        if (url) contact.picture = url
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length) }, worker))
  }

  clear(): void {
    for (const entry of this.urls.values()) this.revokeObjectUrl(entry.url)
    this.urls.clear()
    this.missing.clear()
    this.pending.clear()
  }

  private async load(sessionPhone: string, pictureId: string): Promise<string | undefined> {
    const key = `${sessionPhone}:${pictureId}`
    const cached = this.urls.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.url
    if (cached) {
      this.urls.delete(key)
      this.revokeObjectUrl(cached.url)
    }
    const missingUntil = this.missing.get(key) || 0
    if (missingUntil > this.now()) return undefined
    this.missing.delete(key)
    const running = this.pending.get(key)
    if (running) return running

    const request = this.fetchPicture(sessionPhone, pictureId)
      .then((blob) => {
        if (!blob) {
          this.rememberMissing(key)
          return undefined
        }
        const url = this.createObjectUrl(blob)
        this.urls.set(key, { url, expiresAt: this.now() + this.positiveTtlMs })
        this.trim()
        return url
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, request)
    return request
  }

  private rememberMissing(key: string): void {
    this.missing.set(key, this.now() + this.missingTtlMs)
    while (this.missing.size > this.maxEntries) {
      const oldest = this.missing.keys().next().value
      if (oldest === undefined) break
      this.missing.delete(oldest)
    }
  }

  private trim(): void {
    while (this.urls.size > this.maxEntries) {
      const oldest = this.urls.entries().next().value as [string, { url: string; expiresAt: number }] | undefined
      if (!oldest) break
      this.urls.delete(oldest[0])
      this.revokeObjectUrl(oldest[1].url)
    }
  }
}
