import OpenAI, { toFile } from 'openai'
import { getConfig, Webhook } from '../services/config'
import logger from '../services/logger'
import { Outgoing } from '../services/outgoing'
import { BASE_URL } from '../defaults'
import mediaToBuffer from '../utils/media_to_buffer'
import { extractDestinyPhone, jidToPhoneNumber } from '../services/transformer'
import { jidNormalizedUser, isPnUser } from '@whiskeysockets/baileys'
import { v1 as uuid } from 'uuid'
import Audio2TextJS from 'audio2textjs'
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { SESSION_DIR } from '../services/session_store_file'
import mime from 'mime'

export class TranscriberJob {
  private service: Outgoing
  private getConfig: getConfig

  constructor(service: Outgoing, getConfig: getConfig) {
    this.service = service
    this.getConfig = getConfig
  }

  async consume(phone: string, data: object) {
    try {
      const { payload, webhooks }: { payload: any; webhooks: Webhook[] } = data as any
      const destinyPhone = extractDestinyPhone(payload)
      const payloadEntry = payload?.entry && payload.entry[0]
      const payloadValue = payloadEntry &&
        payload.entry[0].changes &&
        payload.entry[0].changes[0] &&
        payload.entry[0].changes[0].value
      const audioMessage = payloadValue &&
        payload.entry[0].changes[0].value.messages &&
        payload.entry[0].changes[0].value.messages[0]
       
      const config = await this.getConfig(phone)
      const mediaKey = audioMessage.audio.id
      let token = config.authToken
      let mediaUrl = `${BASE_URL}/v13.0/${mediaKey}`
      if (config.connectionType == 'forward') {
        mediaUrl = `${config.webhookForward.url}/${config.webhookForward.version}/${mediaKey}`
        token = config.webhookForward.token
      }
      const { buffer, link, mimeType } = await mediaToBuffer(
        mediaUrl,
        token!,
        webhooks[0].timeoutMs || 0,
      )
      const extension = config.connectionType == 'forward' ? `.${mime.extension(mimeType)}` : ''
      let transcriptionText = ''
      if (config.groqApiKey) {
        logger.debug('Transcriber audio with Groq for session %s to %s', phone, destinyPhone)
        const splitedLink = link.split('/')
        const originalName = `${splitedLink[splitedLink.length - 1]}${extension}`
        const allowed = new Set(['flac','mp3','mp4','mpeg','mpga','m4a','ogg','opus','wav','webm'])
        const nameParts = originalName.split('.')
        const rawExt = (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '').toLowerCase()
        let normExt = rawExt
        if (normExt === 'oga') {
          normExt = 'ogg'
        }
        if (!allowed.has(normExt) || !normExt) {
          normExt = 'ogg'
        }
        const baseName = nameParts.length > 1 ? nameParts.slice(0, -1).join('.') : (originalName || 'audio')
        const uploadName = `${baseName}.${normExt}`
        const file = await toFile(buffer, uploadName)
        const form = new FormData()
        form.append('file', file as unknown as Blob)
        form.append('model', config.groqApiTranscribeModel || 'whisper-large-v3')
        const baseUrl = (config.groqApiBaseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '')
        const res = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.groqApiKey}`,
          },
          body: form as unknown as BodyInit,
        })
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          throw new Error(`Groq transcription failed: ${res.status} ${res.statusText} ${errText}`)
        }
        const json = await res.json() as { text?: string }
        transcriptionText = json.text || ''
      } else if (config.openaiApiKey) {
        logger.debug('Transcriber audio with OpenAI for session %s to %s', phone, destinyPhone)
        const openai = new OpenAI({ apiKey: config.openaiApiKey })
        const splitedLink = link.split('/')
        const fileName = `${splitedLink[splitedLink.length - 1]}${extension}`
        const transcription = await openai.audio.transcriptions.create({
          file: await toFile(buffer, fileName),
          model: config.openaiApiTranscribeModel || 'gpt-4o-mini-transcribe',
        })
        transcriptionText = transcription.text
      } else {
        logger.debug('Transcriber audio with Audio2TextJS for session %s to %s', phone, destinyPhone)
        const converter = new Audio2TextJS({
            threads: 4,
            processors: 1,
            outputJson: true,
        })
        if (!existsSync(SESSION_DIR)) {
          mkdirSync(SESSION_DIR)
        }
        if (!existsSync(`${SESSION_DIR}/${mediaKey.split('/')[0]}`)) {
          mkdirSync(`${SESSION_DIR}/${mediaKey.split('/')[0]}`)
        }
        const tempFile = `${SESSION_DIR}/${mediaKey}`
        writeFileSync(tempFile, buffer)
        const result = await converter.runWhisper(tempFile, 'tiny', 'auto')
        transcriptionText = result.output
        rmSync(tempFile)
      }
      logger.debug('Transcriber audio content for session %s and to %s is %s', phone, destinyPhone, transcriptionText)
      const output = { ...payload }
      output.entry[0].changes[0].value.messages = [{
        context: {
          message_id: audioMessage.id,
          id: audioMessage.id,
        },
        from: audioMessage.from,
        id: uuid(),
        text: { body: transcriptionText },
        type: 'text',
        timestamp: `${parseInt(audioMessage.timestamp) + 1}`,
      }]
      // Preferir PN sobre LID no payload do webhook (mesma regra do OutgoingCloudApi)
      try {
        const store = await config.getStore(phone, config)
        const ds: any = store?.dataStore
        const v: any = output?.entry?.[0]?.changes?.[0]?.value || {}
        const toPnIfMapped = async (x?: string): Promise<string> => {
          let val = `${x || ''}`
          if (!val) return val
          if (val.includes('@g.us')) return val
          if (val.includes('@lid')) {
            try {
              const mapped = await ds?.getPnForLid?.(phone, val)
              if (mapped) return jidToPhoneNumber(mapped, '')
            } catch {}
            try {
              const normalized = jidNormalizedUser(val)
              if (normalized && isPnUser(normalized as any)) {
                try { await ds?.setJidMapping?.(phone, normalized as any, val) } catch {}
                return jidToPhoneNumber(normalized, '')
              }
            } catch {}
          }
          try {
            if (val.includes('@s.whatsapp.net')) return jidToPhoneNumber(val, '')
          } catch {}
          return val
        }
        if (Array.isArray(v.contacts)) {
          for (const c of v.contacts) {
            if (c && typeof c.wa_id === 'string') c.wa_id = await toPnIfMapped(c.wa_id)
          }
        }
        if (Array.isArray(v.messages)) {
          for (const m of v.messages) {
            if (m && typeof m.from === 'string') m.from = await toPnIfMapped(m.from)
          }
        }
      } catch {}
      await Promise.all(
        webhooks.map(async (w) => {
          logger.debug('Transcriber phone %s to %s sending webhook %s', phone, destinyPhone, w.id)
          return this.service.sendHttp(phone, w, output, {})
        }),
      )
    } catch (error) {
      logger.error(error)
      throw error
    }
  }
}
