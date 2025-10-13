import os from 'os'
import path from 'path'
import { writeFileSync, unlinkSync, readFileSync } from 'fs'
import { v1 as uuid } from 'uuid'
import { DOWNLOAD_AUDIO_FFMPEG_MP3_PARAMS, WEBHOOK_TIMEOUT_MS } from '../defaults'
import { spawn } from 'child_process'

export async function convertBufferToMp3(inputBuffer: Buffer): Promise<Buffer> {
  const inputFile = path.join(os.tmpdir(), `${uuid()}`)
  const outputFile = path.join(os.tmpdir(), `${uuid()}`)
  await writeFileSync(inputFile, inputBuffer)
  return new Promise<Buffer>(async (resolve, reject) => {
    const ff = await spawn('ffmpeg', ['-y', '-i', inputFile, ...DOWNLOAD_AUDIO_FFMPEG_MP3_PARAMS, outputFile], {
      timeout: WEBHOOK_TIMEOUT_MS,
    })
    ff.on('exit', async (code, signal) => {
      if (signal) {
        code = parseInt(signal as unknown as string)
      }
      if (code === 0) {
        const buffer = await readFileSync(outputFile)
        await unlinkSync(outputFile)
        await unlinkSync(inputFile)
        return resolve(buffer)
      }
      reject(code)
    })
  })
}

