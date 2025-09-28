import audioConverter from './audio_converter'

export async function convertToOggPtt(
  inputUrl: string,
  _timeoutMs?: number
): Promise<{ buffer: Buffer; mimetype: string; waveform?: Uint8Array }> {
  const { buffer, waveform } = await audioConverter(inputUrl)
  return { buffer, mimetype: 'audio/ogg; codecs=opus', waveform }
}

