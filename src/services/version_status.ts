import fs from 'fs'
import path from 'path'

const TAGS_API_URL = 'https://api.github.com/repos/ViperTecCorporation/ViperConnect/tags?per_page=100'
const TAG_URL_PREFIX = 'https://github.com/ViperTecCorporation/ViperConnect/tree/'
const CACHE_TTL_MS = 15 * 60 * 1000
const FAILURE_TTL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 5000

type Fetcher = typeof fetch

type GitHubTag = {
  name?: string
}

type ParsedVersion = {
  major: number
  minor: number
  patch: number
  prerelease?: string
}

export type VersionStatus = {
  installed_version: string
  latest_version?: string
  update_available: boolean
  status: 'current' | 'update_available' | 'unknown'
  checked_at: string
  release_url?: string
}

export const readInstalledVersion = (): string => {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    return `${manifest.version || ''}`.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

const parseVersion = (value: string): ParsedVersion | undefined => {
  const match = value.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  }
}

const comparePrerelease = (left?: string, right?: string): number => {
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' })
}

export const compareVersions = (left: string, right: string): number => {
  const leftVersion = parseVersion(left)
  const rightVersion = parseVersion(right)
  if (!leftVersion || !rightVersion) return 0
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (leftVersion[key] !== rightVersion[key]) return leftVersion[key] - rightVersion[key]
  }
  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease)
}

export const newestVersionTag = (tags: GitHubTag[]): string | undefined =>
  tags
    .map((tag) => `${tag.name || ''}`.trim())
    .filter((tag) => !!parseVersion(tag))
    .sort((left, right) => compareVersions(right, left))[0]

export class VersionStatusService {
  private cached?: { value: VersionStatus; expiresAt: number }
  private pending?: Promise<VersionStatus>

  constructor(
    private readonly currentVersion = readInstalledVersion(),
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<VersionStatus> {
    const now = this.now()
    if (this.cached && this.cached.expiresAt > now) return this.cached.value
    if (this.pending) return this.pending
    this.pending = this.refresh().finally(() => {
      this.pending = undefined
    })
    return this.pending
  }

  private async refresh(): Promise<VersionStatus> {
    const checkedAt = new Date(this.now()).toISOString()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      if (!parseVersion(this.currentVersion)) throw new Error('installed_version_invalid')
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ViperConnect-Version-Check',
      }
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
      const response = await this.fetcher(TAGS_API_URL, {
        headers,
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`github_tags_http_${response.status}`)
      const payload = await response.json()
      const latestTag = newestVersionTag(Array.isArray(payload) ? payload : [])
      if (!latestTag) throw new Error('github_tags_empty')
      const updateAvailable = compareVersions(latestTag, this.currentVersion) > 0
      return this.cache({
        installed_version: this.currentVersion,
        latest_version: latestTag.replace(/^v/i, ''),
        update_available: updateAvailable,
        status: updateAvailable ? 'update_available' : 'current',
        checked_at: checkedAt,
        release_url: `${TAG_URL_PREFIX}${encodeURIComponent(latestTag)}`,
      }, CACHE_TTL_MS)
    } catch {
      return this.cache({
        installed_version: this.currentVersion,
        update_available: false,
        status: 'unknown',
        checked_at: checkedAt,
      }, FAILURE_TTL_MS)
    } finally {
      clearTimeout(timeout)
    }
  }

  private cache(value: VersionStatus, ttl: number): VersionStatus {
    this.cached = { value, expiresAt: this.now() + ttl }
    return value
  }
}

export const versionStatusService = new VersionStatusService()
