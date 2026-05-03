import { generateBusinessAccountId } from '../../src/services/meta_ids'

describe('service meta ids', () => {
  test('generates a deterministic numeric business account id', () => {
    const first = generateBusinessAccountId('5566999554300', '123456789')
    const second = generateBusinessAccountId('+55 (66) 99955-4300', '123456789')

    expect(first).toEqual(second)
    expect(first).toMatch(/^[1-9]\d{14}$/)
  })

  test('changes when phone number id changes', () => {
    const first = generateBusinessAccountId('5566999554300', '111')
    const second = generateBusinessAccountId('5566999554300', '222')

    expect(first).not.toEqual(second)
  })
})
