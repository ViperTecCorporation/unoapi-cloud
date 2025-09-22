import fetch from 'node-fetch'
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'

export async function convertToOggPtt(inputUrl: string, timeoutMs = 60000): Promise<{ buffer: Buffer; mimetype: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'unoapi-audio-'))
  const inFile = join(dir, 'in.mp3')
  const outFile = join(dir, 'out.ogg')
  try {
    const res = await fetch(inputUrl, { signal: AbortSignal.timeout(timeoutMs), method: 'GET' as any })
    if (!res.ok) {
      throw new Error(`download failed: ${res.status}`)
    }
    const arrayBuffer = await res.arrayBuffer()
    const inputBuffer = Buffer.from(arrayBuffer)
    writeFileSync(inFile, inputBuffer)

    // ffmpeg -y -i in.mp3 -ac 1 -vn -c:a libopus -b:a 32k -f ogg out.ogg
    await new Promise<void>((resolve, reject) => {
      const args = ['-y', '-i', inFile, '-ac', '1', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', outFile]
      const proc = spawn('ffmpeg', args, { stdio: 'ignore' })
      proc.on('error', reject)
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
    })

    const buffer = readFileSync(outFile)
    return { buffer, mimetype: 'audio/ogg; codecs=opus' }
  } finally {
    try { unlinkSync(inFile) } catch {}
    try { unlinkSync(outFile) } catch {}
    try { rmdirSync(dir) } catch {}
  }
}

