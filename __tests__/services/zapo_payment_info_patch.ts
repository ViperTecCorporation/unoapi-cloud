const { patchAddonKind, patchButtonNode } = require('../../scripts/patch-zapo-payment-info.cjs')

describe('Zapo commerce transport patch', () => {
  test('preserves upstream payment flows and adds the Uno order status flow', () => {
    const source = [
      'function resolveButtonAddonKind(message) {',
      '    return resolveButtonAddonKindFrom(unwrapMessage(message));',
      '}',
      'function resolveNativeFlowAddonKind(nativeFlow) {',
      '    const firstButtonName = nativeFlow.buttons?.[0]?.name;',
      "    if (firstButtonName === 'payment_info')",
      "        return 'payment_info';",
      "    if (firstButtonName === 'review_and_pay')",
      "        return 'order_details';",
      "    return 'interactive';",
      '}',
      'function resolveButtonAddonKindFrom(msg) {',
      '}',
    ].join('\n')
    const patched = patchAddonKind(source)
    expect(patched).toContain("firstButtonName === 'payment_info'")
    expect(patched).toContain("firstButtonName === 'review_and_pay'")
    expect(patched).toContain("firstButtonName === 'review_order'")
    expect(patched).toContain("return 'order_status'")
    expect(patchAddonKind(patched)).toBe(patched)
  })

  test('preserves upstream commerce nodes and adds the Uno order status node', () => {
    const upstreamBody = "    const nativeFlowName = kind === 'payment_info' || kind === 'order_details' ? kind : 'mixed';\n"
    const cjs = patchButtonNode(`const tag = constants_1.WA_NODE_TAGS.BIZ;\nfunction buildButtonAddonNode(kind) {\n${upstreamBody}}`)
    const esm = patchButtonNode(`export function buildButtonAddonNode(kind) {\n${upstreamBody}}`)
    expect(cjs).toContain('constants_1.WA_NODE_TAGS.BIZ')
    expect(esm).toContain('WA_NODE_TAGS.BIZ')
    expect(esm).toContain("kind === 'order_status'")
    expect(esm).toContain("native_flow_name: 'order_status'")
    expect(esm).toContain(upstreamBody.trim())
    expect(patchButtonNode(esm)).toBe(esm)
  })
})
