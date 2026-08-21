import { execFile } from 'child_process'
import { createReadStream } from 'fs'
import { mkdtemp, open, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import logger from '../logger'

const PDF_HEADER_BYTES = 1024
const ORACLE_SCAN_BYTES = 1024 * 1024
const RISK_SCAN_CHUNK_BYTES = 256 * 1024
const MAX_NORMALIZED_PDF_BYTES = 128 * 1024 * 1024
const QPDF_TIMEOUT_MS = 5_000
const QPDF_CONCURRENCY = 2

const oracleReportsSignature = /(?:Oracle\d+[a-z]*R?\d*\s+AS\s+Reports\s+Services|Oracle\s+PDF\s+driver)/i
const riskyPdfFeature = /(?:\/Encrypt\b|\/ByteRange\b|\/AcroForm\b|\/Type\s*\/Sig\b)/

export type ZapoPdfMediaInput = string | Uint8Array
export type QpdfRunner = (inputPath: string, outputPath: string) => Promise<void>

const runQpdf: QpdfRunner = async (inputPath, outputPath) => {
  await new Promise<void>((resolveRun, rejectRun) => {
    execFile('qpdf', [
      '--linearize',
      '--object-streams=disable',
      resolve(inputPath),
      resolve(outputPath),
    ], {
      timeout: QPDF_TIMEOUT_MS,
      maxBuffer: 256 * 1024,
    }, (error) => error ? rejectRun(error) : resolveRun())
  })
}

const asBuffer = (input: Uint8Array) => Buffer.from(input.buffer, input.byteOffset, input.byteLength)

const isPdf = (bytes: Buffer) => bytes.subarray(0, PDF_HEADER_BYTES).includes(Buffer.from('%PDF-'))

export const isLegacyOraclePdf = (bytes: Uint8Array): boolean => {
  const buffer = asBuffer(bytes)
  if (!isPdf(buffer)) return false
  return oracleReportsSignature.test(buffer.subarray(0, ORACLE_SCAN_BYTES).toString('latin1'))
}

export const hasRiskyPdfFeatures = (bytes: Uint8Array): boolean => {
  const buffer = asBuffer(bytes)
  let carry = ''
  for (let offset = 0; offset < buffer.length; offset += RISK_SCAN_CHUNK_BYTES) {
    const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + RISK_SCAN_CHUNK_BYTES))
    const text = carry + chunk.toString('latin1')
    if (riskyPdfFeature.test(text)) return true
    carry = text.slice(-64)
  }
  return false
}

const inspectPath = async (filePath: string): Promise<Buffer> => {
  const handle = await open(filePath, 'r')
  try {
    const fileStat = await handle.stat()
    const length = Math.min(fileStat.size, ORACLE_SCAN_BYTES)
    const bytes = Buffer.alloc(length)
    await handle.read(bytes, 0, length, 0)
    return bytes
  } finally {
    await handle.close()
  }
}

const pathHasRiskyPdfFeatures = async (filePath: string): Promise<boolean> => {
  let carry = ''
  for await (const rawChunk of createReadStream(filePath, { highWaterMark: RISK_SCAN_CHUNK_BYTES })) {
    const text = carry + Buffer.from(rawChunk).toString('latin1')
    if (riskyPdfFeature.test(text)) return true
    carry = text.slice(-64)
  }
  return false
}

class ConcurrencyLimiter {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolveWait) => this.waiting.push(resolveWait))
    }
    this.active++
    return () => {
      this.active--
      this.waiting.shift()?.()
    }
  }
}

export class ZapoLegacyPdfNormalizer {
  private readonly limiter: ConcurrencyLimiter

  constructor(
    private readonly processRunner: QpdfRunner = runQpdf,
    concurrency = QPDF_CONCURRENCY,
  ) {
    this.limiter = new ConcurrencyLimiter(Math.max(1, Math.floor(concurrency)))
  }

  async normalizeForWhatsApp(input: ZapoPdfMediaInput, mimetype?: string): Promise<ZapoPdfMediaInput> {
    const normalizedMime = `${mimetype || ''}`.toLowerCase().split(';')[0].trim()
    if (normalizedMime && !['application/pdf', 'application/octet-stream'].includes(normalizedMime)) return input

    let inspection: Buffer
    try {
      inspection = typeof input === 'string' ? await inspectPath(input) : asBuffer(input)
    } catch {
      return input
    }
    if (!isLegacyOraclePdf(inspection)) return input

    try {
      const risky = typeof input === 'string'
        ? await pathHasRiskyPdfFeatures(input)
        : hasRiskyPdfFeatures(input)
      if (risky) {
        logger.info('Skipped Zapo legacy Oracle PDF normalization because the document has protected or interactive features')
        return input
      }
    } catch (error) {
      logger.warn(error as Error, 'Could not inspect Zapo legacy Oracle PDF; preserving original document')
      return input
    }

    const release = await this.limiter.acquire()
    let workDir = ''
    const startedAt = process.hrtime.bigint()
    try {
      workDir = await mkdtemp(join(tmpdir(), 'unoapi-oracle-pdf-'))
      const inputPath = typeof input === 'string' ? input : join(workDir, 'input.pdf')
      const outputPath = join(workDir, 'output.pdf')
      if (typeof input !== 'string') await writeFile(inputPath, input)
      const inputSize = typeof input === 'string' ? (await stat(inputPath)).size : input.byteLength
      await this.processRunner(inputPath, outputPath)
      const outputStat = await stat(outputPath)
      const allowedOutputBytes = Math.min(MAX_NORMALIZED_PDF_BYTES, (inputSize * 2) + (1024 * 1024))
      if (!outputStat.size || outputStat.size > allowedOutputBytes) {
        throw new Error(`legacy_pdf_output_size_invalid:${outputStat.size}:${allowedOutputBytes}`)
      }
      const output = await readFile(outputPath)
      if (!isPdf(output)) throw new Error('legacy_pdf_output_is_not_pdf')
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
      logger.info(
        'Normalized Zapo legacy Oracle PDF for WhatsApp Web input_bytes=%s output_bytes=%s duration_ms=%s',
        inputSize,
        output.length,
        durationMs.toFixed(1),
      )
      return output
    } catch (error) {
      logger.warn(error as Error, 'Zapo legacy Oracle PDF normalization failed; preserving original document')
      return input
    } finally {
      try {
        if (workDir) await rm(workDir, { recursive: true, force: true })
      } catch (error) {
        logger.warn(error as Error, 'Could not remove temporary Zapo legacy PDF directory')
      } finally {
        release()
      }
    }
  }
}

export const zapoLegacyPdfNormalizer = new ZapoLegacyPdfNormalizer()
