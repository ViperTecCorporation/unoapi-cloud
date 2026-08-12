const fs = require('node:fs')
const path = require('node:path')

const legacyPaymentKindBlock = `    const nativeButtons = msg.interactiveMessage?.nativeFlowMessage?.buttons;
    if (Array.isArray(nativeButtons) && nativeButtons.length === 1 && nativeButtons[0]?.name === 'payment_info')
        return 'payment';
    if (Array.isArray(nativeButtons) && nativeButtons.length === 1 && nativeButtons[0]?.name === 'review_and_pay')
        return 'order_details';
    if (Array.isArray(nativeButtons) && nativeButtons.length === 1 && nativeButtons[0]?.name === 'review_order')
        return 'order_status';
`

const orderStatusKindBlock = `    if (firstButtonName === 'review_order')
        return 'order_status';
`

const legacyPaymentNodeBlock = `    if (kind === 'payment' || kind === 'order_details' || kind === 'order_status') {
        return {
            tag: WA_NODE_TAGS.BIZ,
            attrs: {
                native_flow_name: kind === 'payment'
                    ? 'payment_info'
                    : kind
            },
            content: undefined
        };
    }
`

const orderStatusNodeBlock = `    if (kind === 'order_status') {
        return {
            tag: WA_NODE_TAGS.BIZ,
            attrs: { native_flow_name: 'order_status' },
            content: undefined
        };
    }
`

const patchAddonKind = (source) => {
  if (source.includes("if (firstButtonName === 'review_order')")) return source

  const upstreamAnchor = "    return 'interactive';\n}\nfunction resolveButtonAddonKindFrom(msg) {\n"
  if (source.includes(upstreamAnchor)) {
    return source.replace(upstreamAnchor, orderStatusKindBlock + upstreamAnchor)
  }

  const legacyAnchor = "    if (msg.buttonsMessage || msg.interactiveMessage?.nativeFlowMessage)\n"
  if (!source.includes(legacyAnchor)) throw new Error('zapo-js resolveButtonAddonKind anchor not found')
  const existingStart = source.indexOf('    const nativeButtons = msg.interactiveMessage?.nativeFlowMessage?.buttons;\n')
  if (existingStart >= 0) {
    const anchorIndex = source.indexOf(legacyAnchor, existingStart)
    if (anchorIndex < 0) throw new Error('zapo-js resolveButtonAddonKind generic anchor not found')
    return source.slice(0, existingStart) + legacyPaymentKindBlock + source.slice(anchorIndex)
  }
  return source.replace(legacyAnchor, legacyPaymentKindBlock + legacyAnchor)
}

const patchButtonNode = (source) => {
  const cjsAnchor = 'function buildButtonAddonNode(kind) {\n'
  const esmAnchor = 'export function buildButtonAddonNode(kind) {\n'
  const anchor = source.includes(cjsAnchor) ? cjsAnchor : esmAnchor
  if (!anchor || !source.includes(anchor)) throw new Error('zapo-js buildButtonAddonNode anchor not found')
  const constantsName = source.includes('constants_1.WA_NODE_TAGS')
    ? 'constants_1.WA_NODE_TAGS'
    : 'WA_NODE_TAGS'
  if (source.includes("if (kind === 'order_status')")) return source

  if (source.includes("const nativeFlowName = kind === 'payment_info'")) {
    return source.replace(anchor, anchor + orderStatusNodeBlock.replaceAll('WA_NODE_TAGS', constantsName))
  }

  const nodeBlock = legacyPaymentNodeBlock.replaceAll('WA_NODE_TAGS', constantsName)
  if (source.includes("if (kind === 'payment'")) {
    return source.replace(
      /    if \(kind === 'payment'[\s\S]*?^    \}\n(?=    const inner)/m,
      nodeBlock,
    )
  }
  return source.replace(anchor, anchor + nodeBlock)
}

const patchFile = (file, transform) => {
  const source = fs.readFileSync(file, 'utf8')
  const patched = transform(source)
  if (patched !== source) fs.writeFileSync(file, patched)
}

const patchInstalledZapo = (root = process.cwd()) => {
  const zapoDist = path.join(root, 'node_modules', 'zapo-js', 'dist')
  for (const format of ['', 'esm']) {
    const base = path.join(zapoDist, format)
    patchFile(path.join(base, 'message', 'encode', 'content.js'), patchAddonKind)
    patchFile(path.join(base, 'transport', 'node', 'builders', 'message.js'), patchButtonNode)
  }
}

if (require.main === module) patchInstalledZapo()

module.exports = { patchAddonKind, patchButtonNode, patchInstalledZapo }
