import { bufferJson } from '../../src/services/buffer_json'

describe('provider-neutral buffer JSON codec', () => {
  test('round-trips Buffer and Uint8Array values', () => {
    const encoded = JSON.stringify({
      buffer: Buffer.from([1, 2]),
      bytes: new Uint8Array([3, 4]),
    }, bufferJson.replacer)
    const decoded = JSON.parse(encoded, bufferJson.reviver)

    expect(Buffer.from(decoded.buffer)).toEqual(Buffer.from([1, 2]))
    expect(Buffer.from(decoded.bytes)).toEqual(Buffer.from([3, 4]))
  })
})
