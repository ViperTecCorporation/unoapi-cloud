import { BinaryNode } from '@whiskeysockets/baileys'

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
