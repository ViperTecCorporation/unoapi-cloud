export const bufferJson = {
  replacer: (_key: string, value: any): any => {
    if (Buffer.isBuffer(value)) {
      return { type: 'Buffer', data: [...value] }
    }
    if (value instanceof Uint8Array) {
      return { type: 'Buffer', data: [...value] }
    }
    return value
  },
  reviver: (_key: string, value: any): any => {
    if (value?.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data)
    }
    return value
  },
}
