import {
  proto,
  WAMessage,
  WAMessageKey,
  WASocket,
  useMultiFileAuthState,
  GroupMetadata,
  isLidUser,
  jidNormalizedUser,
} from '@whiskeysockets/baileys'
import { isIndividualJid, jidToPhoneNumber, phoneNumberToJid, ensurePn } from './transformer'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { DataStore, MessageStatus } from './data_store'
import { SESSION_DIR } from './session_store_file'
import { getDataStore, dataStores } from './data_store'
import { Config } from './config'
import logger from './logger'
import NodeCache from 'node-cache'
import { BASE_URL, PROFILE_PICTURE_FORCE_REFRESH } from '../defaults'
import { JIDMAP_CACHE_ENABLED, JIDMAP_TTL_SECONDS } from '../defaults'

export const MEDIA_DIR = './data/medias'
const HOUR = 60 * 60

export const getDataStoreFile: getDataStore = async (phone: string, config: Config): Promise<DataStore> => {
  if (!dataStores.has(phone)) {
    logger.debug('Creating data store file %s', phone)
    const store = await dataStoreFile(phone, config)
    dataStores.set(phone, store)
  } else {
    logger.debug('Retrieving data store file %s', phone)
  }
  return dataStores.get(phone) as DataStore
}

const deepMerge = (obj1, obj2) => {
  const result = { ...obj1 };
  for (let key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (obj2[key] instanceof Object && obj1[key] instanceof Object) {
        result[key] = deepMerge(obj1[key], obj2[key]);
      } else {
        result[key] = obj2[key];
      }
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataStoreFile = async (phone: string, config: Config): Promise<DataStore> => {
  const keys: Map<string, proto.IMessageKey> = new Map()
  const jids: Map<string, string> = new Map()
  const ids: Map<string, string> = new Map()
  const statuses: Map<string, string> = new Map()
  const medias: Map<string, string> = new Map()
  const messages: Map<string, any> = new Map()
  const groups: NodeCache = new NodeCache()
  // JID mapping cache (PN <-> LID) per-process
  const jidMap: NodeCache = new NodeCache()
  const JMAP_ENABLED = JIDMAP_CACHE_ENABLED
  const JMAP_TTL = JIDMAP_TTL_SECONDS
  const store = await useMultiFileAuthState(SESSION_DIR)
  const dataStore = store as DataStore
  dataStore.type = 'file'

	dataStore.loadMessage = async(jid: string, id: string) => messages.get(`${jid}-${id}`),
  dataStore.toJSON = () => {
    return {
      messages,
      keys,
      jids,
      ids,
      statuses,
      groups: groups.keys().reduce((acc, key) => {
          acc.set(key, groups.get(key))
          return acc
        }, new Map()),
      medias,
    }
  }
  dataStore.fromJSON = (json) => {
    json?.messages.entries().forEach(([key, value]) => {
      messages.set(key, value)
    })
    json?.keys.entries().forEach(([key, value]) => {
      keys.set(key, value)
    })
    json?.jids.entries().forEach(([key, value]) => {
      jids.set(key, value)
    })
    json?.ids.entries().forEach(([key, value]) => {
      jids.set(key, value)
    })
    json?.statuses.entries().forEach(([key, value]) => {
      statuses.set(key, value)
    })
    json?.groups.entries().forEach(([key, value]) => {
      groups.set(key, value, HOUR)
    })
    json?.medias.entries().forEach(([key, value]) => {
      medias.set(key, value)
    })
  }
  // JID map helpers
  const jidMapGet = (key: string) => jidMap.get<string>(key)
  const jidMapSet = (key: string, val: string, ttlSec: number) => {
    try { jidMap.set(key, val, ttlSec) } catch {}
  }
	dataStore.writeToFile = (path: string) => {
    const { writeFileSync } = require('fs')
    // for(const a in Object.keys(dataStore.toJSON())) {
    //   console.log(a)
    // }
    writeFileSync(path, JSON.stringify(dataStore.toJSON()))
  }
  dataStore.readFromFile = (path: string) => {
    const { readFileSync, existsSync } = require('fs')
    if(existsSync(path)) {
      logger.debug({ path }, 'reading from file')
      const jsonStr = readFileSync(path, { encoding: 'utf-8' })
      const json = JSON.parse(jsonStr)
      dataStore.fromJSON(json)
    }
  }
  dataStore.loadKey = async (id: string) => {
    return keys.get(id)
  }
  dataStore.setKey = async (id: string, key: WAMessageKey) => {
    return new Promise<void>((resolve) => keys.set(id, key) && resolve())
  }
  dataStore.getImageUrl = async (jid: string) => {
    const { mediaStore } = await config.getStore(phone, config)
    // Tenta pelo JID recebido; se PN e houver LID mapeado, tenta LID também
    const tryVariants = async (baseJid: string): Promise<string | undefined> => {
      const primary = await mediaStore.getProfilePictureUrl(BASE_URL, baseJid)
      if (primary) return primary
      try {
        // tentar variante mapeada
        let alt: string | undefined
        if (isLidUser(baseJid)) {
          const pn = await dataStore.getPnForLid?.(phone, baseJid)
          alt = pn
        } else {
          const lid = await dataStore.getLidForPn?.(phone, baseJid)
          alt = lid
        }
        if (alt) {
          logger.debug('getImageUrl: fallback to mapped variant %s for %s', alt, baseJid)
          const other = await mediaStore.getProfilePictureUrl(BASE_URL, alt)
          if (other) return other
        }
      } catch {}
      return undefined
    }
    const url = await tryVariants(jid)
    logger.debug('Retrieved profile picture %s for %s', url, jid)
    return url
  }
  dataStore.setImageUrl = async (jid: string, url: string) => {
    const { mediaStore } = await config.getStore(phone, config)
    const { saveProfilePicture } = mediaStore
    // Salva uma vez; saveProfilePicture agora grava PN e LID quando possível
    try {
      await saveProfilePicture({ imgUrl: url, id: jid })
    } catch {}
  }
  dataStore.loadImageUrl = async (jid: string, sock: WASocket) => {
    logger.debug('Search profile picture for %s', jid)
    const { mediaStore } = await config.getStore(phone, config)
    // Canonical deve ser o número (PN). Se não soubermos, tentar mapear via PN<->LID.
    let canonicalPn = ensurePn(jid) || ''
    if (!canonicalPn) {
      try {
        if (isLidUser(jid)) {
          const pnJid = await dataStore.getPnForLid?.(phone, jid)
          canonicalPn = ensurePn(pnJid) || ''
        }
      } catch {}
    }
    const preferredJid = canonicalPn ? `${canonicalPn}@s.whatsapp.net` : jid
    logger.info('PROFILE_PICTURE lookup: input=%s canonicalPn=%s preferredJid=%s', jid, canonicalPn || '<unknown>', preferredJid)
    const buildLocalUrl = async (): Promise<string | undefined> => {
      try { return await mediaStore.getProfilePictureUrl(BASE_URL, preferredJid) } catch { return undefined }
    }

    // Tentar local primeiro se não for forçar refresh
    const force = PROFILE_PICTURE_FORCE_REFRESH
    let localUrl = force ? undefined : await buildLocalUrl()
    if (!force && localUrl) {
      logger.info('PROFILE_PICTURE cache hit (local): %s', localUrl)
    }

    // Se não existe local ou forçar atualização, buscar no WhatsApp e persistir
    if (!localUrl) {
      let remoteUrl: string | undefined
      try {
        // Preferir JID canônico (PN) ao consultar a foto
        const queryJid = preferredJid
        logger.debug('Fetch profile picture from WA for %s', queryJid)
        remoteUrl = await sock.profilePictureUrl(queryJid)
        if (!remoteUrl && queryJid !== jid) {
          logger.debug('Retry profile picture fetch for original %s', jid)
          remoteUrl = await sock.profilePictureUrl(jid)
        }
      } catch {}
      if (remoteUrl) {
        logger.info('PROFILE_PICTURE fetched from WA: %s', remoteUrl)
        await dataStore.setImageUrl(preferredJid, remoteUrl)
        // Recalcular URL local após persistir
        localUrl = await buildLocalUrl()
        if (localUrl) {
          logger.info('PROFILE_PICTURE persisted -> local URL: %s', localUrl)
        }
      }
    }
    logger.debug('Found %s profile picture for %s (canonical=%s)', localUrl, jid, canonicalPn || '<unknown>')
    return localUrl
  }

  dataStore.getGroupMetada = async (jid: string) => {
    return groups.get(jid)
  }
  dataStore.setGroupMetada = async (jid: string, data: GroupMetadata) => {
    groups.set(jid, data, HOUR)
  }
  dataStore.loadGroupMetada = async (jid: string, sock: WASocket) => {
    let data = await dataStore.getGroupMetada(jid)
    if (!data) {
      data = await sock.groupMetadata(jid)
      if (data) {
        await dataStore.setGroupMetada(jid, data)
      }
    }
    return data
  }

  // JID mapping cache (PN <-> LID)
  // previous PN<->LID helpers replaced by unified cache below

  dataStore.setStatus = async (id: string, status: MessageStatus) => {
    statuses.set(id, status)
  }
  dataStore.loadStatus = async (id: string) => {
    return statuses.get(id)
  }

  dataStore.loadUnoId = async (id: string) =>  ids.get(id) || ids.get(`${phone}-${id}`)
  dataStore.setUnoId = async (id: string, unoId: string) => {
    ids.set(`${phone}-${id}`, unoId)
  }
  dataStore.loadJid = async (phoneOrJid: string, sock: Partial<WASocket>) => {
    /**
     * Resolve and cache a JID for a given phone number or JID.
     * - Uses onWhatsApp() when needed and stores the result.
     * - Handles LID cases and a few fallbacks (self phone, status@broadcast).
     */
    if (!isIndividualJid(phoneOrJid)) {
      return phoneOrJid
    }
    let jid = await dataStore.getJid(phoneOrJid)
    let lid
    if (isLidUser(jid)) {
      lid = jid
    }
    if (!jid || lid) {
    let results: unknown
    // quick mapping: if input is a LID JID and a PN is cached, return it
    try {
      if (isIndividualJid(phoneOrJid) && (phoneOrJid || '').includes('@lid')) {
        const pn = await dataStore.getPnForLid?.(phone, phoneOrJid)
        if (pn) {
          await dataStore.setJid(phoneOrJid, pn)
          return pn
        }
      }
    } catch {}
      try {
        logger.debug(`Verifing if ${phoneOrJid} exist on WhatsApp`)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        results = await sock?.onWhatsApp!(phoneOrJid)
      } catch (e) {
        logger.error(e, `Error on check if ${phoneOrJid} has whatsapp`)
        try {
          if (jidToPhoneNumber(phone) === jidToPhoneNumber(phoneOrJid)) {
            jid = phoneNumberToJid(phone)
            logger.info(`${phone} is the phone connection ${phone} returning ${jid}`)
            return jid
          } else if ('status@broadcast' == phoneOrJid) {
            return phoneOrJid
          }
        } catch (error) {
          
        }
      }
      const result = results && results[0]
      let test = result && result?.exists && result?.jid
      logger.debug(`${phoneOrJid} found onWhatsApp exists: ${result?.exists} jid: ${result?.jid} test: ${test}`)
      if (!test) {
        // Fallback: if checking the connection phone itself, return its JID
        try {
          if (jidToPhoneNumber(phone, '') === jidToPhoneNumber(phoneOrJid, '')) {
            const selfJid = phoneNumberToJid(phone)
            logger.info(`${phoneOrJid} is the connection phone; using ${selfJid}`)
            await dataStore.setJid(phoneOrJid, selfJid)
            return selfJid
          }
        } catch (error) {
          // ignore
        }
      }
      if (test) {
        logger.debug(`${phoneOrJid} exists on WhatsApp, as jid: ${result.jid}`)
        jid = result.jid
        await dataStore.setJid(phoneOrJid, jid!)
        try {
          if (isLidUser(jid)) {
            const pn = jidNormalizedUser(jid)
            if (pn) {
              await dataStore.setJidMapping?.(phone, pn, jid as string)
            }
          }
        } catch {}
      } else {
        if (lid) {
          logger.warn(`${phoneOrJid} not retrieve jid on WhatsApp baileys return lid ${lid}`)
          return lid
        } else {
          logger.warn(`${phoneOrJid} not exists on WhatsApp baileys onWhatsApp return results ${results ? JSON.stringify(results) : null}`)
        }
      }
    }
    return jid
  }
  dataStore.loadMediaPayload = async (id: string) => {
    const string = medias.get(id)
    return string ? JSON.parse(string) : undefined
  }
  dataStore.setMediaPayload = async (id: string, payload: string) => {
    medias.set(id, JSON.stringify(payload))
  }
  dataStore.setJid = async (phoneOrJid: string, jid: string) => {
    jids.set(phoneOrJid, jid)
  }
  dataStore.setJidIfNotFound = async (phoneOrJid: string, jid: string) => {
    if (await dataStore.getJid(jid)) {
      return
    }
    return dataStore.setJid(phoneOrJid, jid)
  }
  dataStore.getJid = async (phoneOrJid: string) => {
    return jids.get(phoneOrJid)
  }
  dataStore.setMessage = async (jid: string, message: WAMessage) => {
    messages.get(jid)?.set(`${jid}-${message?.key?.id!}`, message)
  }
  // --- PN <-> LID mapping helpers (optional) ---
  dataStore.getPnForLid = async (sessionPhone: string, lidJid: string) => {
    if (!JMAP_ENABLED) return undefined
    try {
      if (typeof lidJid !== 'string') return undefined
      const key = `PN_FOR:${lidJid}`
      const cached = jidMapGet(key)
      if (cached) return cached
      // Fallback: derive PN from LID via Baileys normalization
      try {
        if (isLidUser(lidJid)) {
          const pn = jidNormalizedUser(lidJid)
          if (pn) {
            // Persist mapping both ways
            logger.debug('jidMap: derived PN %s from LID %s (file-store)', pn, lidJid)
            await dataStore.setJidMapping?.(sessionPhone, pn, lidJid)
            return pn
          }
        }
      } catch {}
      return undefined
    } catch { return undefined }
  }
  dataStore.getLidForPn = async (_sessionPhone: string, pnJid: string) => {
    if (!JMAP_ENABLED) return undefined
    try {
      if (typeof pnJid !== 'string') return undefined
      const key = `LID_FOR:${pnJid}`
      return jidMapGet(key)
    } catch { return undefined }
  }
  dataStore.setJidMapping = async (_sessionPhone: string, pnJid: string, lidJid: string) => {
    if (!JMAP_ENABLED) return
    try {
      if (typeof pnJid !== 'string' || typeof lidJid !== 'string') return
      jidMapSet(`PN_FOR:${lidJid}`, pnJid, JMAP_TTL)
      jidMapSet(`LID_FOR:${pnJid}`, lidJid, JMAP_TTL)
      // also reflect mapping in generic JID cache to speed up loadJid()
      try { jids.set(pnJid, pnJid); jids.set(lidJid, pnJid) } catch {}
    } catch {}
  }
  dataStore.cleanSession = async (_removeConfig = false) => {
    const sessionDir = `${SESSION_DIR}/${phone}`
    if (existsSync(sessionDir)) {
      logger.info(`Clean session phone %s dir %s`, phone, sessionDir)
      return rmSync(sessionDir, { recursive: true })
    } else {
      logger.info(`Already empty session phone %s dir %s`, phone, sessionDir)
    }
  }
  dataStore.setTemplates = async (templates: string) => {
    const sessionDir = `${SESSION_DIR}/${phone}`
    const templateFile = `${sessionDir}/templates.json`
    let newTemplates = templates
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true })
    } else {
      const currentTemplates = dataStore.loadTemplates()
      newTemplates = deepMerge(currentTemplates, templates)
    }
    return writeFileSync(templateFile, JSON.stringify(newTemplates))
  }
  dataStore.loadTemplates = async () => {
    const templateFile = `${SESSION_DIR}/${phone}/templates.json`
    if (existsSync(templateFile)) {
      const string = readFileSync(templateFile)
      if (string) {
        return JSON.parse(string.toString())
      }
    }
    const template = {
      id: 1,
      name: 'hello',
      status: 'APPROVED',
      category: 'UTILITY',
      components: [
        {
          text: '{{hello}}',
          type: 'BODY',
          parameters: [
            {
              type: 'text',
              text: 'hello',
            },
          ],
        },
      ],
    }

    return [template]
  }
  return dataStore
}
