import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  hasRiskyPdfFeatures,
  isLegacyOraclePdf,
  ZapoLegacyPdfNormalizer,
} from '../../../src/services/zapo/zapo_legacy_pdf'

const oraclePdf = (extra = '') => Buffer.from([
  '%PDF-1.4',
  '1 0 obj',
  '<< /Creator (Oracle10gR2 AS Reports Services)',
  '   /Producer (Oracle PDF driver)',
  `   ${extra}`,
  '>>',
  'endobj',
  '%%EOF',
].join('\n'))

const normalizedPdf = Buffer.from('%PDF-1.4\n% normalized by qpdf\n%%EOF\n')

describe('Zapo legacy Oracle PDF normalization', () => {
  test('detects the Oracle Reports producer without classifying ordinary PDFs', () => {
    expect(isLegacyOraclePdf(oraclePdf())).toBe(true)
    expect(isLegacyOraclePdf(Buffer.from('%PDF-1.7\n/Producer (Acme PDF)\n%%EOF'))).toBe(false)
    expect(isLegacyOraclePdf(Buffer.from('Oracle PDF driver'))).toBe(false)
  })

  test.each(['/Encrypt 5 0 R', '/ByteRange [0 10 20 30]', '/AcroForm 8 0 R', '/Type /Sig']) (
    'recognizes protected or interactive feature %s',
    (feature) => expect(hasRiskyPdfFeatures(oraclePdf(feature))).toBe(true),
  )

  test('normalizes matching bytes and returns only the temporary qpdf output', async () => {
    const runner = jest.fn(async (_inputPath: string, outputPath: string) => writeFile(outputPath, normalizedPdf))
    const normalizer = new ZapoLegacyPdfNormalizer(runner)
    const source = oraclePdf()

    const result = await normalizer.normalizeForWhatsApp(source, 'application/pdf')

    expect(Buffer.from(result as Uint8Array)).toEqual(normalizedPdf)
    expect(source).toEqual(oraclePdf())
    expect(runner).toHaveBeenCalledTimes(1)
  })

  test('normalizes a locally staged Base64 document path', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'unoapi-oracle-pdf-test-'))
    const inputPath = join(testDir, 'source.pdf')
    await writeFile(inputPath, oraclePdf())
    const runner = jest.fn(async (receivedInput: string, outputPath: string) => {
      expect(receivedInput).toBe(inputPath)
      await writeFile(outputPath, normalizedPdf)
    })
    try {
      const result = await new ZapoLegacyPdfNormalizer(runner).normalizeForWhatsApp(inputPath, 'application/pdf')
      expect(Buffer.from(result as Uint8Array)).toEqual(normalizedPdf)
      expect(await readFile(inputPath)).toEqual(oraclePdf())
    } finally {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  test('does not invoke qpdf for ordinary documents, other MIME types or risky PDFs', async () => {
    const runner = jest.fn()
    const normalizer = new ZapoLegacyPdfNormalizer(runner)
    const ordinary = Buffer.from('%PDF-1.7\n/Producer (Acme PDF)\n%%EOF')
    const protectedOracle = oraclePdf('/ByteRange [0 10 20 30]')

    await expect(normalizer.normalizeForWhatsApp(ordinary, 'application/pdf')).resolves.toBe(ordinary)
    await expect(normalizer.normalizeForWhatsApp(oraclePdf(), 'image/jpeg')).resolves.toEqual(oraclePdf())
    await expect(normalizer.normalizeForWhatsApp(protectedOracle, 'application/pdf')).resolves.toBe(protectedOracle)
    expect(runner).not.toHaveBeenCalled()
  })

  test('falls back to the exact original when qpdf is missing or fails', async () => {
    const source = oraclePdf()
    const normalizer = new ZapoLegacyPdfNormalizer(async () => {
      throw new Error('qpdf unavailable')
    })

    await expect(normalizer.normalizeForWhatsApp(source, 'application/pdf')).resolves.toBe(source)
  })

  test('limits Oracle conversion to two concurrent qpdf processes', async () => {
    let active = 0
    let maximumActive = 0
    const runner = async (_inputPath: string, outputPath: string) => {
      active++
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolveWait) => setTimeout(resolveWait, 20))
      await writeFile(outputPath, normalizedPdf)
      active--
    }
    const normalizer = new ZapoLegacyPdfNormalizer(runner, 2)

    await Promise.all([
      normalizer.normalizeForWhatsApp(oraclePdf(), 'application/pdf'),
      normalizer.normalizeForWhatsApp(oraclePdf(), 'application/pdf'),
      normalizer.normalizeForWhatsApp(oraclePdf(), 'application/pdf'),
    ])

    expect(maximumActive).toBe(2)
  })
})
