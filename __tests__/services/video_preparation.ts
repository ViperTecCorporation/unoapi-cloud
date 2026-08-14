import { Readable } from 'stream'
import { writeFile } from 'fs/promises'
import { mock } from 'jest-mock-extended'
import type { MediaStore } from '../../src/services/media_store'
import {
  isWhatsAppCompatibleVideo,
  transcodeArgs,
  videoBitrateKbps,
  VideoPreparationService,
} from '../../src/services/video_preparation'
import { BASE_URL } from '../../src/defaults'

describe('video preparation', () => {
  test('recognizes the documented H264/AAC MP4-compatible streams', () => {
    expect(isWhatsAppCompatibleVideo({
      durationSeconds: 10,
      sizeBytes: 1_000,
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodecs: ['aac'],
    })).toBe(true)
    expect(isWhatsAppCompatibleVideo({
      durationSeconds: 10,
      sizeBytes: 1_000,
      videoCodec: 'hevc',
      pixelFormat: 'yuv420p10le',
      audioCodecs: ['aac'],
    })).toBe(false)
  })

  test('caps CPU and bitrate in the generated ffmpeg command', () => {
    const probe = {
      durationSeconds: 17,
      sizeBytes: 36_000_000,
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodecs: ['aac'],
    }
    const args = transcodeArgs('/tmp/input', '/tmp/output.mp4', probe)

    expect(videoBitrateKbps(17, true)).toBeLessThanOrEqual(2500)
    expect(args).toEqual(expect.arrayContaining(['-threads', '1', '-filter_threads', '1', '-movflags', '+faststart']))
    expect(args).toContain('libx264')
  })

  test('stages the source as a stream and enforces a durable source key', async () => {
    const mediaStore = mock<MediaStore>()
    let stored = Buffer.alloc(0)
    mediaStore.saveMediaStream.mockImplementation(async (_key, stream) => {
      for await (const chunk of stream) stored = Buffer.concat([stored, Buffer.from(chunk)])
      return true
    })
    const fetchVideo = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name: string) => name === 'content-length' ? '5' : 'video/quicktime' },
      body: Readable.from(Buffer.from('video')),
    })
    const service = new VideoPreparationService(jest.fn(), fetchVideo as any)

    await expect(service.stage(mediaStore, '5566', 'message-1', 'https://example/video')).resolves.toEqual({
      sourceKey: '5566/message-1.video-source',
      contentType: 'video/quicktime',
      sizeBytes: 5,
    })
    expect(stored.toString()).toBe('video')
  })

  test('transcodes an oversized source and stores a fast-start MP4 below the target', async () => {
    const mediaStore = mock<MediaStore>()
    mediaStore.type = 's3'
    mediaStore.downloadMediaStream.mockResolvedValue(Readable.from(Buffer.from('source')))
    mediaStore.saveMediaBuffer.mockResolvedValue(true)
    mediaStore.getFileUrl.mockResolvedValue('https://uno.example/prepared.mp4')
    const runner = jest.fn(async (command: string, args: string[]) => {
      if (command === 'ffprobe') {
        return {
          stdout: JSON.stringify({
            format: { duration: '17.0', size: '36596373' },
            streams: [
              { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
              { codec_type: 'audio', codec_name: 'aac' },
            ],
          }),
          stderr: '',
        }
      }
      await writeFile(args[args.length - 1], Buffer.alloc(2_000_000))
      return { stdout: '', stderr: '' }
    })
    const service = new VideoPreparationService(runner)

    const result = await service.prepare(mediaStore, '5566', 'message-2', 'source-key')

    expect(result).toEqual(expect.objectContaining({ transcoded: true, sizeBytes: 2_000_000 }))
    expect(runner).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['-c:v', 'libx264']), expect.any(Number))
    expect(mediaStore.saveMediaBuffer).toHaveBeenCalledWith(
      '5566/message-2.prepared.mp4',
      expect.any(Buffer),
      'video/mp4',
    )
  })

  test('remuxes an already compatible small source instead of re-encoding it', async () => {
    const mediaStore = mock<MediaStore>()
    mediaStore.type = 'file'
    mediaStore.downloadMediaStream.mockResolvedValue(Readable.from(Buffer.from('source')))
    mediaStore.saveMediaBuffer.mockResolvedValue(true)
    mediaStore.getDownloadUrl.mockResolvedValue('https://uno.example/v15.0/download/prepared.mp4')
    const runner = jest.fn(async (command: string, args: string[]) => {
      if (command === 'ffprobe') return {
        stdout: JSON.stringify({
          format: { duration: '5', size: '1000' },
          streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' }],
        }),
        stderr: '',
      }
      await writeFile(args[args.length - 1], Buffer.alloc(1_000))
      return { stdout: '', stderr: '' }
    })
    const service = new VideoPreparationService(runner)

    await expect(service.prepare(mediaStore, '5566', 'message-3', 'source-key')).resolves.toEqual(
      expect.objectContaining({ transcoded: false }),
    )
    expect(runner).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining(['-c', 'copy']), expect.any(Number))
    expect(mediaStore.getDownloadUrl).toHaveBeenCalledWith(BASE_URL, '5566/message-3.prepared.mp4')
  })
})
