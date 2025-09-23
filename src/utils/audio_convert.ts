import fetch from 'node-fetch'
import { spawn } from 'child_process'

// Stream the input MP3 directly into ffmpeg and collect the OGG output
// This avoids buffering the entire input file in memory and skips temp files.
export async function convertToOggPtt(inputUrl: string, timeoutMs = 60000): Promise<{ buffer: Buffer; mimetype: string }> {
  const controller = AbortController ? new AbortController() : undefined
  const signal = controller?.signal

  // If AbortSignal.timeout is available (Node 18+), prefer it to enforce total timeout
  const fetchSignal: AbortSignal | undefined = (AbortSignal as any)?.timeout
    ? (AbortSignal as any).timeout(timeoutMs)
    : signal

  const res = await fetch(inputUrl, { method: 'GET' as any, signal: fetchSignal })
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status}`)
  }

  return await new Promise<{ buffer: Buffer; mimetype: string }>((resolve, reject) => {
    const args = [
      '-y',
      '-i', 'pipe:0', // read from stdin
      '-ac', '1',
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-f', 'ogg',
      'pipe:1', // write to stdout
    ]

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []

    const onError = (err: unknown) => {
      try { proc.kill('SIGKILL') } catch {}
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    proc.on('error', onError)
    proc.stderr?.on('data', () => { /* discard to avoid backpressure; keep default buffering */ })

    proc.stdout?.on('data', (d: Buffer) => {
      chunks.push(d)
    })
    proc.stdout?.on('error', onError)

    proc.on('close', (code) => {
      if (code === 0) {
        const buffer = Buffer.concat(chunks)
        resolve({ buffer, mimetype: 'audio/ogg; codecs=opus' })
      } else {
        onError(new Error(`ffmpeg exit ${code}`))
      }
    })

    // Pipe fetch body into ffmpeg stdin
    res.body.on('error', onError)
    res.body.pipe(proc.stdin!)

    // Enforce timeout if AbortSignal.timeout not used
    if (!fetchSignal && timeoutMs > 0) {
      setTimeout(() => onError(new Error('conversion timeout')), timeoutMs).unref?.()
    }
  })
}
