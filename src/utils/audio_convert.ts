import fetch from 'node-fetch'

// Convert MP3 (or other audio) to OGG/Opus using @mmomtchev/ffmpeg Streams API.
// Streams the download into Demuxer and collects the OGG output without temp files.
export async function convertToOggPtt(inputUrl: string, timeoutMs = 60000): Promise<{ buffer: Buffer; mimetype: string }> {
  // Lazy-load to avoid paying cost when not used
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ffmpeg = (await import('@mmomtchev/ffmpeg')).default as any
  const stream = await import('@mmomtchev/ffmpeg/stream') as any
  const { Demuxer, AudioDecoder, AudioEncoder, Muxer, Discarder } = stream

  const abort = (AbortSignal as any)?.timeout ? (AbortSignal as any).timeout(timeoutMs) : undefined
  const res = await fetch(inputUrl, { method: 'GET' as any, signal: abort })
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status}`)
  }

  return await new Promise<{ buffer: Buffer; mimetype: string }>((resolve, reject) => {
    const demuxer = new Demuxer()
    const chunks: Buffer[] = []
    let done = false

    const finish = (err?: unknown) => {
      if (done) return
      done = true
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      } else {
        resolve({ buffer: Buffer.concat(chunks), mimetype: 'audio/ogg; codecs=opus' })
      }
    }

    const onError = (e: unknown) => finish(e)

    demuxer.on('error', onError)
    res.body.on('error', onError)

    demuxer.on('ready', () => {
      try {
        const encodedAudio = demuxer.audio && demuxer.audio[0]
        if (!encodedAudio) {
          throw new Error('no audio stream in input')
        }

        const decoder = new AudioDecoder({ stream: encodedAudio.stream })
        const inDef = decoder.definition()

        // Prepare Opus encoder definition; keep input sampling parameters to avoid an extra resample step
        const outDef = {
          type: 'Audio',
          codec: ffmpeg.AV_CODEC_OPUS,
          bitRate: 32_000,
          channelLayout: inDef.channelLayout,
          sampleFormat: inDef.sampleFormat,
          sampleRate: inDef.sampleRate,
        }
        const encoder = new AudioEncoder(outDef)

        // Create muxer that exposes a Readable output (no temp files)
        const muxer = new Muxer({ outputFormat: 'ogg', streams: [encoder] })

        // Drain any extra streams to avoid backpressure
        if (demuxer.video && demuxer.video.length) demuxer.video.forEach((v: any) => v.pipe(new Discarder()))
        if (demuxer.audio && demuxer.audio.length > 1) demuxer.audio.slice(1).forEach((a: any) => a.pipe(new Discarder()))

        // Collect muxed OGG bytes
        if (muxer.output) {
          muxer.output.on('data', (d: Buffer) => chunks.push(Buffer.from(d)))
          muxer.output.on('error', onError)
        }
        muxer.on('finish', () => finish())

        // Wire pipeline: demux -> decode -> encode -> mux
        encodedAudio.pipe(decoder).pipe(encoder).pipe(muxer.audio[0])

        // Start feeding the demuxer
        res.body.pipe(demuxer.input)
      } catch (e) {
        onError(e)
      }
    })

    // Timeout guard when AbortSignal.timeout is not used by fetch
    if (!abort && timeoutMs > 0) {
      setTimeout(() => onError(new Error('conversion timeout')), timeoutMs).unref?.()
    }
  })
}
