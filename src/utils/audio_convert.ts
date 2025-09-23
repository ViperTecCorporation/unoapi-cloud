import fetch from 'node-fetch'
import { spawn } from 'child_process'

async function convertWithBindings(inputUrl: string, timeoutMs: number): Promise<{ buffer: Buffer; mimetype: string }> {
  // Lazy-load native bindings; may fail on unsupported platforms/architectures
  const ffmpeg = (await import('@mmomtchev/ffmpeg')).default as any
  const stream = (await import('@mmomtchev/ffmpeg/stream')) as any
  const { Demuxer, AudioDecoder, AudioEncoder, Muxer, Discarder } = stream

  const abort = (AbortSignal as any)?.timeout ? (AbortSignal as any).timeout(timeoutMs) : undefined
  const res = await fetch(inputUrl, { method: 'GET' as any, signal: abort })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)

  return await new Promise<{ buffer: Buffer; mimetype: string }>((resolve, reject) => {
    const demuxer = new Demuxer()
    const chunks: Buffer[] = []
    let finished = false
    const done = (err?: unknown) => {
      if (finished) return
      finished = true
      if (err) reject(err instanceof Error ? err : new Error(String(err)))
      else resolve({ buffer: Buffer.concat(chunks), mimetype: 'audio/ogg; codecs=opus' })
    }
    const onError = (e: unknown) => done(e)
    demuxer.on('error', onError)
    res.body.on('error', onError)
    demuxer.on('ready', () => {
      try {
        const encodedAudio = demuxer.audio && demuxer.audio[0]
        if (!encodedAudio) throw new Error('no audio stream in input')
        const decoder = new AudioDecoder({ stream: encodedAudio.stream })
        const inDef = decoder.definition()
        const outDef = {
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_OPUS,
          bitRate: 32_000,
          channelLayout: inDef.channelLayout,
          sampleFormat: inDef.sampleFormat,
          sampleRate: inDef.sampleRate,
        }
        const encoder = new AudioEncoder(outDef)
        const muxer = new Muxer({ outputFormat: 'ogg', streams: [encoder] })
        if (demuxer.video && demuxer.video.length) demuxer.video.forEach((v: any) => v.pipe(new Discarder()))
        if (demuxer.audio && demuxer.audio.length > 1) demuxer.audio.slice(1).forEach((a: any) => a.pipe(new Discarder()))
        if (muxer.output) {
          muxer.output.on('data', (d: Buffer) => chunks.push(Buffer.from(d)))
          muxer.output.on('error', onError)
        }
        muxer.on('finish', () => done())
        encodedAudio.pipe(decoder).pipe(encoder).pipe(muxer.audio[0])
        res.body.pipe(demuxer.input)
      } catch (e) { onError(e) }
    })
    if (!abort && timeoutMs > 0) setTimeout(() => onError(new Error('conversion timeout')), timeoutMs).unref?.()
  })
}

async function convertWithCli(inputUrl: string, timeoutMs: number): Promise<{ buffer: Buffer; mimetype: string }> {
  const abort = (AbortSignal as any)?.timeout ? (AbortSignal as any).timeout(timeoutMs) : undefined
  const res = await fetch(inputUrl, { method: 'GET' as any, signal: abort })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
  return await new Promise<{ buffer: Buffer; mimetype: string }>((resolve, reject) => {
    const args = ['-y', '-i', 'pipe:0', '-ac', '1', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1']
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    const onError = (err: unknown) => { try { proc.kill('SIGKILL') } catch {} ; reject(err instanceof Error ? err : new Error(String(err))) }
    proc.on('error', onError)
    proc.stderr?.on('data', () => {})
    proc.stdout?.on('data', (d: Buffer) => chunks.push(d))
    proc.stdout?.on('error', onError)
    proc.on('close', (code) => {
      if (code === 0) resolve({ buffer: Buffer.concat(chunks), mimetype: 'audio/ogg; codecs=opus' })
      else onError(new Error(`ffmpeg exit ${code}`))
    })
    res.body.on('error', onError)
    res.body.pipe(proc.stdin!)
    if (!abort && timeoutMs > 0) setTimeout(() => onError(new Error('conversion timeout')), timeoutMs).unref?.()
  })
}

export async function convertToOggPtt(inputUrl: string, timeoutMs = 60000): Promise<{ buffer: Buffer; mimetype: string }> {
  try {
    // Try native bindings first
    return await convertWithBindings(inputUrl, timeoutMs)
  } catch (_e) {
    // Fallback to system ffmpeg binary
    return await convertWithCli(inputUrl, timeoutMs)
  }
}
