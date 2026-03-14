type AudioBufferLike = {
  getChannelData: (channel: number) => Float32Array
}

const decode = async (_buffer: ArrayBuffer | Buffer): Promise<AudioBufferLike> => {
  return {
    getChannelData: (_channel: number) => new Float32Array(64).fill(0.5),
  }
}

export default decode
