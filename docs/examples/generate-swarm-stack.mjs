#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const marker = '      # __SWARM_VOIP_MEDIA_PORTS__'
const stackNames = ['nginx', 'traefik']

const defaultRanges = Object.freeze({
  rtpMin: 12000,
  rtpMax: 13000,
  webrtcMin: 13001,
  webrtcMax: 14000,
})

const optionNames = Object.freeze({
  '--rtp-min': 'rtpMin',
  '--rtp-max': 'rtpMax',
  '--webrtc-min': 'webrtcMin',
  '--webrtc-max': 'webrtcMax',
})

const environmentNames = Object.freeze({
  rtpMin: 'SIP_RTP_MEDIA_PORT_MIN',
  rtpMax: 'SIP_RTP_MEDIA_PORT_MAX',
  webrtcMin: 'SIP_WEBRTC_UDP_PORT_MIN',
  webrtcMax: 'SIP_WEBRTC_UDP_PORT_MAX',
})

const usage = `Gera os modelos Docker Swarm com as faixas UDP compactas no proprio YAML.

Uso:
  node generate-swarm-stack.mjs [opcoes]

Opcoes:
  --rtp-min PORTA       Inicio da faixa SIP/RTP
  --rtp-max PORTA       Fim da faixa SIP/RTP
  --webrtc-min PORTA    Inicio da faixa WebRTC
  --webrtc-max PORTA    Fim da faixa WebRTC
  --output-dir CAMINHO  Diretorio dos arquivos gerados
  --check               Apenas verifica se os arquivos gerados estao atuais
  --help                Mostra esta ajuda

As mesmas quatro portas podem ser definidas pelas variaveis
SIP_RTP_MEDIA_PORT_MIN/MAX e SIP_WEBRTC_UDP_PORT_MIN/MAX.`

const parsePort = (value, label) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${label} deve ser uma porta inteira entre 1 e 65535`)
  }
  return parsed
}

const overlaps = (leftMin, leftMax, rightMin, rightMax) =>
  leftMin <= rightMax && rightMin <= leftMax

export const validateRanges = (ranges) => {
  const normalized = {}
  for (const [key, environmentName] of Object.entries(environmentNames)) {
    normalized[key] = parsePort(ranges[key], environmentName)
  }

  if (normalized.rtpMin > normalized.rtpMax) {
    throw new Error('SIP_RTP_MEDIA_PORT_MIN nao pode ser maior que SIP_RTP_MEDIA_PORT_MAX')
  }
  if (normalized.webrtcMin > normalized.webrtcMax) {
    throw new Error('SIP_WEBRTC_UDP_PORT_MIN nao pode ser maior que SIP_WEBRTC_UDP_PORT_MAX')
  }
  if (overlaps(normalized.rtpMin, normalized.rtpMax, normalized.webrtcMin, normalized.webrtcMax)) {
    throw new Error('As faixas SIP/RTP e WebRTC nao podem se sobrepor')
  }

  for (const fixedPort of [3097, 5060]) {
    if (
      (fixedPort >= normalized.rtpMin && fixedPort <= normalized.rtpMax) ||
      (fixedPort >= normalized.webrtcMin && fixedPort <= normalized.webrtcMax)
    ) {
      throw new Error(`A porta reservada ${fixedPort} nao pode fazer parte das faixas de midia`)
    }
  }

  const total =
    normalized.rtpMax - normalized.rtpMin + 1 +
    normalized.webrtcMax - normalized.webrtcMin + 1
  if (total > 4096) {
    throw new Error(`As faixas gerariam ${total} publicacoes; reduza-as para no maximo 4096 portas`)
  }

  return normalized
}

export const rangesFromEnvironment = (environment = process.env, overrides = {}) =>
  validateRanges(
    Object.fromEntries(
      Object.entries(environmentNames).map(([key, environmentName]) => [
        key,
        overrides[key] ?? environment[environmentName] ?? defaultRanges[key],
      ]),
    ),
  )

export const renderStack = (template, ranges) => {
  const normalized = validateRanges(ranges)
  if (!template.includes(marker)) throw new Error(`Template sem marcador obrigatorio: ${marker.trim()}`)

  const mediaPorts = [
    '      # Faixas fixas compactas; o docker stack config expande cada porta em mode: ingress.',
    `      - "${normalized.rtpMin}-${normalized.rtpMax}:${normalized.rtpMin}-${normalized.rtpMax}/udp"`,
    `      - "${normalized.webrtcMin}-${normalized.webrtcMax}:${normalized.webrtcMin}-${normalized.webrtcMax}/udp"`,
  ].join('\n')

  return template
    .replaceAll('__SIP_RTP_MEDIA_PORT_MIN__', String(normalized.rtpMin))
    .replaceAll('__SIP_RTP_MEDIA_PORT_MAX__', String(normalized.rtpMax))
    .replaceAll('__SIP_WEBRTC_UDP_PORT_MIN__', String(normalized.webrtcMin))
    .replaceAll('__SIP_WEBRTC_UDP_PORT_MAX__', String(normalized.webrtcMax))
    .replace(marker, mediaPorts)
}

export const generateSwarmStacks = async ({
  directory = scriptDirectory,
  outputDirectory = directory,
  ranges = defaultRanges,
  check = false,
} = {}) => {
  const normalized = validateRanges(ranges)
  const results = []
  if (!check) await mkdir(outputDirectory, { recursive: true })

  for (const name of stackNames) {
    const templatePath = path.join(directory, `docker-stack.unoapi-${name}.template.yml`)
    const outputPath = path.join(outputDirectory, `docker-stack.unoapi-${name}.yml`)
    const template = await readFile(templatePath, 'utf8')
    const expected = renderStack(template, normalized)

    if (check) {
      const current = await readFile(outputPath, 'utf8')
      if (current !== expected) {
        throw new Error(`${path.basename(outputPath)} esta desatualizado; execute o gerador novamente`)
      }
    } else {
      await writeFile(outputPath, expected)
    }
    results.push(outputPath)
  }

  return results
}

const parseArguments = (argumentsList) => {
  const overrides = {}
  let outputDirectory = scriptDirectory
  let check = false

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === '--help') return { help: true }
    if (argument === '--check') {
      check = true
      continue
    }
    if (argument === '--output-dir') {
      const value = argumentsList[++index]
      if (!value) throw new Error('--output-dir exige um caminho')
      outputDirectory = path.resolve(value)
      continue
    }
    const rangeName = optionNames[argument]
    if (rangeName) {
      const value = argumentsList[++index]
      if (!value) throw new Error(`${argument} exige uma porta`)
      overrides[rangeName] = value
      continue
    }
    throw new Error(`Opcao desconhecida: ${argument}`)
  }

  return { overrides, outputDirectory, check, help: false }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMainModule) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log(usage)
    } else {
      const ranges = rangesFromEnvironment(process.env, options.overrides)
      const generated = await generateSwarmStacks({
        outputDirectory: options.outputDirectory,
        ranges,
        check: options.check,
      })
      console.log(`${options.check ? 'Stacks verificados' : 'Stacks gerados'}: ${generated.join(', ')}`)
    }
  } catch (error) {
    console.error(`Erro: ${error.message}`)
    process.exitCode = 1
  }
}

export { defaultRanges }
