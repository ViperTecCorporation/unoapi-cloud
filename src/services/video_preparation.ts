import { createWriteStream } from 'fs'
import { mkdtemp, readFile, rm, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import fetch from 'node-fetch'
import {
  BASE_URL,
  DATA_URL_TTL,
  UNOAPI_VIDEO_MAX_INPUT_BYTES,
  UNOAPI_VIDEO_STAGE_TIMEOUT_MS,
  UNOAPI_VIDEO_TARGET_BYTES,
  UNOAPI_VIDEO_TRANSCODE_TIMEOUT_MS,
} from '../defaults'
import type { MediaStore } from './media_store'
import logger from './logger'

export type VideoProbe = {
  durationSeconds: number
  sizeBytes: number
  videoCodec: string
  pixelFormat: string
  audioCodecs: string[]
}

export type StagedVideo = {
  sourceKey: string
  contentType: string
  sizeBytes: number
}

export type PreparedVideo = {
  key: string
  link: string
  sizeBytes: number
  transcoded: boolean
}

type ProcessResult = { stdout: string; stderr: string }
type ProcessRunner = (command: string, args: string[], timeoutMs: number) => Promise<ProcessResult>

const runProcess: ProcessRunner = (command, args, timeoutMs) => new Promise((resolve, reject) => {
  const lowPriorityFfmpeg = command === 'ffmpeg' && process.platform !== 'win32'
  const child = spawn(lowPriorityFfmpeg ? 'nice' : command, lowPriorityFfmpeg ? ['-n', '10', command, ...args] : args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  const append = (current: string, chunk: Buffer) => `${current}${chunk.toString()}`.slice(-1024 * 1024)
  child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    reject(new Error(`${command} timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  child.once('error', (error) => {
    clearTimeout(timer)
    reject(error)
  })
  child.once('close', (code) => {
    clearTimeout(timer)
    if (code === 0) resolve({ stdout, stderr })
    else reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-4000)}`))
  })
})

class ByteLimitTransform extends Transform {
  sizeBytes = 0

  constructor(private readonly maxBytes: number) {
    super()
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.sizeBytes += chunk.length
    if (this.sizeBytes > this.maxBytes) {
      callback(new Error(`video_input_too_large:${this.sizeBytes}:${this.maxBytes}`))
      return
    }
    callback(null, chunk)
  }
}

export const isWhatsAppCompatibleVideo = (probe: VideoProbe) =>
  probe.videoCodec === 'h264' &&
  (!probe.pixelFormat || probe.pixelFormat.startsWith('yuv420')) &&
  probe.audioCodecs.length <= 1 &&
  probe.audioCodecs.every((codec) => codec === 'aac')

export const videoBitrateKbps = (durationSeconds: number, hasAudio: boolean, targetBytes = UNOAPI_VIDEO_TARGET_BYTES) => {
  const audioKbps = hasAudio ? 96 : 0
  const availableKbps = ((targetBytes * 8) / Math.max(1, durationSeconds) / 1000) * 0.9 - audioKbps
  return Math.max(100, Math.min(2500, Math.floor(availableKbps)))
}

export const transcodeArgs = (inputPath: string, outputPath: string, probe: VideoProbe, bitrateScale = 1) => {
  const videoKbps = Math.max(80, Math.floor(videoBitrateKbps(probe.durationSeconds, probe.audioCodecs.length > 0) * bitrateScale))
  const args = [
    '-y', '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-vf', "scale=w='if(gte(iw,ih),min(1280,iw),min(720,iw))':h='if(gte(iw,ih),min(720,ih),min(1280,ih))':force_original_aspect_ratio=decrease:force_divisible_by=2",
    '-b:v', `${videoKbps}k`, '-maxrate', `${Math.floor(videoKbps * 1.2)}k`, '-bufsize', `${videoKbps * 2}k`,
    '-threads', '1', '-filter_threads', '1',
  ]
  if (probe.audioCodecs.length) args.push('-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000')
  else args.push('-an')
  args.push('-map_metadata', '0', '-metadata:s:v:0', 'rotate=0', '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', outputPath)
  return args
}

export class VideoPreparationService {
  constructor(
    private readonly processRunner: ProcessRunner = runProcess,
    private readonly fetchVideo: typeof fetch = fetch,
  ) {}

  async stage(mediaStore: MediaStore, phone: string, id: string, link: string): Promise<StagedVideo> {
    const response = await this.fetchVideo(link, {
      method: 'GET',
      signal: AbortSignal.timeout(UNOAPI_VIDEO_STAGE_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) throw new Error(`video_stage_download_failed:http_${response.status}`)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > UNOAPI_VIDEO_MAX_INPUT_BYTES) {
      throw new Error(`video_input_too_large:${contentLength}:${UNOAPI_VIDEO_MAX_INPUT_BYTES}`)
    }
    const contentType = `${response.headers.get('content-type') || 'application/octet-stream'}`.split(';')[0]
    const sourceKey = `${phone}/${id}.video-source`
    const limiter = new ByteLimitTransform(UNOAPI_VIDEO_MAX_INPUT_BYTES)
    const source = response.body as unknown as Readable
    await mediaStore.saveMediaStream(sourceKey, source.pipe(limiter), contentType)
    return { sourceKey, contentType, sizeBytes: limiter.sizeBytes || contentLength }
  }

  private async probe(inputPath: string): Promise<VideoProbe> {
    const result = await this.processRunner('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,pix_fmt', '-of', 'json', inputPath,
    ], UNOAPI_VIDEO_TRANSCODE_TIMEOUT_MS)
    const parsed = JSON.parse(result.stdout || '{}')
    const streams = Array.isArray(parsed.streams) ? parsed.streams : []
    const video = streams.find((stream: any) => stream.codec_type === 'video')
    if (!video) throw new Error('video_probe_missing_video_stream')
    return {
      durationSeconds: Number(parsed?.format?.duration || 0),
      sizeBytes: Number(parsed?.format?.size || 0),
      videoCodec: `${video.codec_name || ''}`,
      pixelFormat: `${video.pix_fmt || ''}`,
      audioCodecs: streams.filter((stream: any) => stream.codec_type === 'audio').map((stream: any) => `${stream.codec_name || ''}`),
    }
  }

  async prepare(mediaStore: MediaStore, phone: string, id: string, sourceKey: string): Promise<PreparedVideo> {
    const workDir = await mkdtemp(join(tmpdir(), 'unoapi-video-'))
    const inputPath = join(workDir, 'input')
    const outputPath = join(workDir, 'output.mp4')
    try {
      const source = await mediaStore.downloadMediaStream(sourceKey)
      if (!source) throw new Error(`video_stage_source_not_found:${sourceKey}`)
      await pipeline(source, createWriteStream(inputPath))
      const probe = await this.probe(inputPath)
      const canRemux = probe.sizeBytes <= UNOAPI_VIDEO_TARGET_BYTES && isWhatsAppCompatibleVideo(probe)
      if (canRemux) {
        await this.processRunner('ffmpeg', [
          '-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-map_metadata', '0', '-movflags', '+faststart', outputPath,
        ], UNOAPI_VIDEO_TRANSCODE_TIMEOUT_MS)
      } else {
        await this.processRunner('ffmpeg', transcodeArgs(inputPath, outputPath, probe), UNOAPI_VIDEO_TRANSCODE_TIMEOUT_MS)
      }

      let outputStat = await stat(outputPath)
      if (outputStat.size > UNOAPI_VIDEO_TARGET_BYTES && !canRemux) {
        logger.warn('Prepared video remained oversized; retrying with a lower bitrate phone=%s id=%s size=%s', phone, id, outputStat.size)
        await this.processRunner('ffmpeg', transcodeArgs(inputPath, outputPath, probe, 0.65), UNOAPI_VIDEO_TRANSCODE_TIMEOUT_MS)
        outputStat = await stat(outputPath)
      }
      if (outputStat.size > UNOAPI_VIDEO_TARGET_BYTES) {
        throw new Error(`video_output_too_large:${outputStat.size}:${UNOAPI_VIDEO_TARGET_BYTES}`)
      }

      const key = `${phone}/${id}.prepared.mp4`
      await mediaStore.saveMediaBuffer(key, await readFile(outputPath), 'video/mp4')
      return {
        key,
        link: mediaStore.type === 'file'
          ? await mediaStore.getDownloadUrl(BASE_URL, key)
          : await mediaStore.getFileUrl(key, DATA_URL_TTL),
        sizeBytes: outputStat.size,
        transcoded: !canRemux,
      }
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }
}
