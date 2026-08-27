import { WaMediaCrypto } from 'zapo-js/media'

const textEncoder = new TextEncoder()

const box = (type: string, payloadLength: number) => {
  const output = new Uint8Array(8 + payloadLength)
  new DataView(output.buffer).setUint32(0, output.byteLength)
  output.set(textEncoder.encode(type), 4)
  return output
}

const concat = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

describe('Zapo 1.8.1 MP4 streaming sidecar', () => {
  const ftyp = box('ftyp', 24)
  const moov = box('moov', 120)
  const mdat = box('mdat', 4_096)
  const mediaKey = new Uint8Array(32).fill(7)

  test('keeps the sidecar for faststart MP4', async () => {
    const encrypted = await WaMediaCrypto.encryptBytes('video', mediaKey, concat(ftyp, moov, mdat))

    expect(encrypted.streamingSidecar?.byteLength).toBeGreaterThan(0)
  })

  test('drops the sidecar when mdat precedes moov', async () => {
    const encrypted = await WaMediaCrypto.encryptBytes('video', mediaKey, concat(ftyp, mdat, moov))

    expect(encrypted.streamingSidecar).toBeUndefined()
  })
})
