import type { BinaryNode } from '@whiskeysockets/baileys'
import { inflateSync } from 'zlib'

const WAP_TAGS = {
  LIST_EMPTY: 0,
  DICTIONARY_0: 236,
  DICTIONARY_1: 237,
  DICTIONARY_2: 238,
  DICTIONARY_3: 239,
  INTEROP_JID: 245,
  FB_JID: 246,
  AD_JID: 247,
  LIST_8: 248,
  LIST_16: 249,
  JID_PAIR: 250,
  HEX_8: 251,
  BINARY_8: 252,
  BINARY_20: 253,
  BINARY_32: 254,
  NIBBLE_8: 255,
} as const

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const unescapeXml = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')

const appendContent = (node: BinaryNode, value: string | BinaryNode) => {
  if (typeof node.content === 'undefined') {
    node.content = value as any
    return
  }
  if (Array.isArray(node.content)) {
    node.content.push(value as any)
    return
  }
  node.content = [node.content as any, value as any]
}

const parseAttrs = (input: string) => {
  const attrs: Record<string, string> = {}
  const attrRegex = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(input))) {
    attrs[match[1]] = unescapeXml(match[3] ?? match[4] ?? '')
  }
  return attrs
}

export const parseVoipXmlFragment = (xml: string): BinaryNode[] => {
  const source = `${xml || ''}`.trim().replace(/^<\?xml[^>]*\?>/i, '')
  if (!source) return []

  const tokens = source.match(/<[^>]+>|[^<]+/g) || []
  const roots: BinaryNode[] = []
  const stack: BinaryNode[] = []

  for (const token of tokens) {
    if (!token) continue
    if (token.startsWith('<!--')) continue
    if (token.startsWith('</')) {
      stack.pop()
      continue
    }
    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>')
      const inner = token.slice(1, selfClosing ? -2 : -1).trim()
      if (!inner) continue
      const firstSpace = inner.search(/\s/)
      const tag = (firstSpace < 0 ? inner : inner.slice(0, firstSpace)).trim()
      const attrsPart = firstSpace < 0 ? '' : inner.slice(firstSpace + 1)
      const node: BinaryNode = {
        tag,
        attrs: parseAttrs(attrsPart),
        content: undefined,
      }
      if (stack.length) appendContent(stack[stack.length - 1], node)
      else roots.push(node)
      if (!selfClosing) stack.push(node)
      continue
    }

    const text = unescapeXml(token)
    if (!text.trim() || !stack.length) continue
    appendContent(stack[stack.length - 1], text)
  }

  return roots
}

export const parseVoipXmlNode = (xml: string): BinaryNode | undefined => {
  const roots = parseVoipXmlFragment(xml)
  return roots.length ? roots[0] : undefined
}

export const getBinaryNodeChildrenSafe = (node?: BinaryNode): BinaryNode[] => {
  const content = node?.content
  if (!Array.isArray(content)) return []
  return content.filter((item): item is BinaryNode => !!item && typeof item === 'object' && typeof (item as any).tag === 'string')
}

export const decompressWapFrameIfRequired = (buffer: Buffer): Buffer => {
  if (!buffer?.length) return Buffer.alloc(0)
  if (2 & buffer.readUInt8(0)) {
    return inflateSync(buffer.subarray(1))
  }
  return buffer.subarray(1)
}

const readUInt20 = (buffer: Buffer, indexRef: { index: number }) => {
  const b1 = buffer[indexRef.index++] || 0
  const b2 = buffer[indexRef.index++] || 0
  const b3 = buffer[indexRef.index++] || 0
  return ((b1 & 0x0f) << 16) | (b2 << 8) | b3
}

const skipPacked8 = (buffer: Buffer, indexRef: { index: number }) => {
  const startByte = buffer[indexRef.index++] || 0
  indexRef.index += startByte & 127
}

const skipWapString = (buffer: Buffer, indexRef: { index: number }, tag: number): void => {
  if (tag >= 1 && tag < WAP_TAGS.DICTIONARY_0) return
  switch (tag) {
    case WAP_TAGS.DICTIONARY_0:
    case WAP_TAGS.DICTIONARY_1:
    case WAP_TAGS.DICTIONARY_2:
    case WAP_TAGS.DICTIONARY_3:
      indexRef.index += 1
      return
    case WAP_TAGS.LIST_EMPTY:
      return
    case WAP_TAGS.BINARY_8: {
      const length = buffer[indexRef.index++] || 0
      indexRef.index += length
      return
    }
    case WAP_TAGS.BINARY_20:
      indexRef.index += readUInt20(buffer, indexRef)
      return
    case WAP_TAGS.BINARY_32: {
      const length = buffer.readUInt32BE(indexRef.index)
      indexRef.index += 4 + length
      return
    }
    case WAP_TAGS.JID_PAIR:
      skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
      skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
      return
    case WAP_TAGS.AD_JID:
      indexRef.index += 2
      skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
      return
    case WAP_TAGS.FB_JID:
      skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
      indexRef.index += 2
      skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
      return
    case WAP_TAGS.INTEROP_JID:
      skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
      indexRef.index += 4
      if (indexRef.index < buffer.length) {
        const maybeTag = buffer[indexRef.index]
        if (maybeTag !== undefined && maybeTag !== WAP_TAGS.LIST_EMPTY) {
          skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
        }
      }
      return
    case WAP_TAGS.HEX_8:
    case WAP_TAGS.NIBBLE_8:
      skipPacked8(buffer, indexRef)
      return
    default:
      throw new Error(`unsupported WAP string tag: ${tag}`)
  }
}

const readListSize = (buffer: Buffer, indexRef: { index: number }, tag: number) => {
  switch (tag) {
    case WAP_TAGS.LIST_EMPTY:
      return 0
    case WAP_TAGS.LIST_8:
      return buffer[indexRef.index++] || 0
    case WAP_TAGS.LIST_16: {
      const size = buffer.readUInt16BE(indexRef.index)
      indexRef.index += 2
      return size
    }
    default:
      throw new Error(`invalid list tag: ${tag}`)
  }
}

const isListTag = (tag: number) =>
  tag === WAP_TAGS.LIST_EMPTY || tag === WAP_TAGS.LIST_8 || tag === WAP_TAGS.LIST_16

const skipWapNode = (buffer: Buffer, indexRef: { index: number }) => {
  const listTag = buffer[indexRef.index++] || 0
  const listSize = readListSize(buffer, indexRef, listTag)
  skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
  const attributesLength = (listSize - 1) >> 1
  for (let i = 0; i < attributesLength; i++) {
    skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
    skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
  }
  if (listSize % 2 === 0) {
    const contentTag = buffer[indexRef.index++] || 0
    if (isListTag(contentTag)) {
      const childCount = readListSize(buffer, indexRef, contentTag)
      for (let i = 0; i < childCount; i++) {
        skipWapNode(buffer, indexRef)
      }
    } else {
      skipWapString(buffer, indexRef, contentTag)
    }
  }
}

export const extractFirstChildDecompressedWapSlice = (buffer: Buffer): Buffer | undefined => {
  if (!buffer?.length) return undefined
  const indexRef = { index: 0 }
  const listTag = buffer[indexRef.index++] || 0
  const listSize = readListSize(buffer, indexRef, listTag)
  skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
  const attributesLength = (listSize - 1) >> 1
  for (let i = 0; i < attributesLength; i++) {
    skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
    skipWapString(buffer, indexRef, buffer[indexRef.index++] || 0)
  }
  if (listSize % 2 !== 0) return undefined
  const contentTagIndex = indexRef.index
  const contentTag = buffer[indexRef.index++] || 0
  if (!isListTag(contentTag)) return undefined

  try {
    const childCount = readListSize(buffer, indexRef, contentTag)
    if (!childCount) return undefined
    const childStart = indexRef.index
    skipWapNode(buffer, indexRef)
    return buffer.subarray(childStart, indexRef.index)
  } catch {
    // Some inbound call frames appear to encode the first child node directly
    // at the content position instead of wrapping it in a children-count list.
    return buffer.subarray(contentTagIndex)
  }
}

const contentToXml = (content: BinaryNode['content']): string => {
  if (typeof content === 'undefined' || content === null) return ''
  if (Array.isArray(content)) return content.map((item) => typeof item === 'string' ? escapeXml(item) : binaryNodeToXml(item)).join('')
  if (Buffer.isBuffer(content)) return escapeXml(content.toString('utf8'))
  if (content instanceof Uint8Array) return escapeXml(Buffer.from(content).toString('utf8'))
  return escapeXml(`${content}`)
}

export const binaryNodeToXml = (node: BinaryNode): string => {
  const attrs = Object.entries(node.attrs || {})
    .map(([key, value]) => ` ${key}="${escapeXml(`${value}`)}"`)
    .join('')
  const content = contentToXml(node.content)
  if (!content) return `<${node.tag}${attrs}/>`
  return `<${node.tag}${attrs}>${content}</${node.tag}>`
}
