const { patchAddonKind, patchButtonNode } = require('../../scripts/patch-zapo-payment-info.cjs')

describe('Zapo commerce transport patch', () => {
  test('classifies payment, order details, and order status as dedicated commerce flows', () => {
    const source = [
      'function resolveButtonAddonKind(message) {',
      '    const msg = unwrapMessage(message);',
      '    if (msg.buttonsMessage || msg.interactiveMessage?.nativeFlowMessage)',
      "        return 'interactive';",
      '}',
    ].join('\n')
    const patched = patchAddonKind(source)
    expect(patched).toContain("nativeButtons[0]?.name === 'payment_info'")
    expect(patched).toContain("nativeButtons[0]?.name === 'review_and_pay'")
    expect(patched).toContain("return 'order_details'")
    expect(patched).toContain("nativeButtons[0]?.name === 'review_order'")
    expect(patched).toContain("return 'order_status'")
    expect(patchAddonKind(patched)).toBe(patched)
  })

  test('builds dedicated business nodes for payment, order details, and order status', () => {
    const cjs = patchButtonNode('const tag = constants_1.WA_NODE_TAGS.BIZ;\nfunction buildButtonAddonNode(kind) {\n}')
    const esm = patchButtonNode('export function buildButtonAddonNode(kind) {\n}')
    expect(cjs).toContain('constants_1.WA_NODE_TAGS.BIZ')
    expect(esm).toContain('WA_NODE_TAGS.BIZ')
    expect(esm).toContain("kind === 'order_details'")
    expect(esm).toContain("kind === 'order_status'")
    expect(esm).toContain("? 'payment_info'")
    expect(esm).toContain(': kind')
    expect(patchButtonNode(esm)).toBe(esm)
  })
})
