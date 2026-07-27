import { createMediaProcessor } from '@zapo-js/media-utils'
import {
  AUDIO_WAVEFORM_SAMPLES,
  CONVERT_AUDIO_MESSAGE_TO_OGG,
  SEND_AUDIO_WAVEFORM,
} from '../../defaults'

export const zapoMediaProcessor = createMediaProcessor({
  waveformPoints: AUDIO_WAVEFORM_SAMPLES,
  voiceNoteBitRate: 64_000,
  voiceNoteSampleRate: 48_000,
  voiceNoteApplication: 'voip',
})

export const zapoMediaOptions = {
  processor: zapoMediaProcessor,
  generateWaveform: SEND_AUDIO_WAVEFORM,
  normalizeVoiceNote: CONVERT_AUDIO_MESSAGE_TO_OGG,
}
