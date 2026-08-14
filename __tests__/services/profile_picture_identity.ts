import { normalizeProfilePictureId, resolveProfilePictureId } from '../../src/services/profile_picture_identity'

describe('profile picture identity', () => {
  test.each([
    ['+5566999069708', '5566999069708'],
    ['5566999069708@s.whatsapp.net', '5566999069708'],
    ['53515477086263:2@lid', '53515477086263@lid'],
    ['120363039221813429@g.us', '120363039221813429@g.us'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeProfilePictureId(input)).toBe(expected)
  })

  test.each(['../avatar', 'folder/avatar', 'lid\\avatar', 'abc@lid', ''])('rejects unsafe identity %s', (input) => {
    expect(normalizeProfilePictureId(input)).toBeUndefined()
  })

  test('is stable when only the signed URL changes', () => {
    const first = resolveProfilePictureId('53515477086263@lid', '5566999069708')
    const second = resolveProfilePictureId('53515477086263@lid', '5566999069708')
    expect(first).toBe(second)
  })
})
