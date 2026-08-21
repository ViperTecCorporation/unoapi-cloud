import { ContactPictureLoader } from '../../frontend/domain/contact_picture_loader'
import type { ContactDirectoryItem } from '../../frontend/domain/types'

const contact = (id: string, picture?: string): ContactDirectoryItem => ({
  user_id: id,
  picture_id: id,
  ...(picture ? { picture } : {}),
  last_updated_ms: 1,
})

describe('ContactPictureLoader', () => {
  test('prefers the authenticated proxy while preserving the legacy URL as fallback', async () => {
    const fetchPicture = jest.fn().mockResolvedValue(new Blob(['picture'], { type: 'image/jpeg' }))
    const loader = new ContactPictureLoader(fetchPicture, {
      createObjectUrl: () => 'blob:https://uno.test/picture',
      revokeObjectUrl: jest.fn(),
    })
    const contacts = [contact('1@lid', 'https://cdn.example/legacy.jpg'), contact('2@lid')]

    await loader.hydrate('5566', contacts)

    expect(contacts[0].picture).toBe('blob:https://uno.test/picture')
    expect(contacts[1].picture).toBe('blob:https://uno.test/picture')
    expect(fetchPicture).toHaveBeenCalledTimes(2)
    expect(fetchPicture).toHaveBeenCalledWith('5566', '1@lid')
    expect(fetchPicture).toHaveBeenCalledWith('5566', '2@lid')
  })

  test('keeps the legacy URL when the authenticated proxy returns 404', async () => {
    const fetchPicture = jest.fn().mockResolvedValue(undefined)
    const loader = new ContactPictureLoader(fetchPicture, {
      createObjectUrl: jest.fn(),
      revokeObjectUrl: jest.fn(),
    })
    const legacy = contact('1@lid', 'https://cdn.example/legacy.jpg')

    await loader.hydrate('5566', [legacy])

    expect(legacy.picture).toBe('https://cdn.example/legacy.jpg')
  })

  test('deduplicates simultaneous and repeated requests for the same identity', async () => {
    const fetchPicture = jest.fn().mockResolvedValue(new Blob(['picture']))
    const loader = new ContactPictureLoader(fetchPicture, {
      createObjectUrl: () => 'blob:https://uno.test/shared',
      revokeObjectUrl: jest.fn(),
    })
    const first = contact('1@lid')
    const second = contact('1@lid')

    await Promise.all([
      loader.hydrate('5566', [first]),
      loader.hydrate('5566', [second]),
    ])
    await loader.hydrate('5566', [contact('1@lid')])

    expect(fetchPicture).toHaveBeenCalledTimes(1)
    expect(first.picture).toBe('blob:https://uno.test/shared')
    expect(second.picture).toBe('blob:https://uno.test/shared')
  })

  test('remembers a 404 locally and does not probe the proxy repeatedly', async () => {
    const fetchPicture = jest.fn().mockResolvedValue(undefined)
    const loader = new ContactPictureLoader(fetchPicture, {
      createObjectUrl: jest.fn(),
      revokeObjectUrl: jest.fn(),
    })

    await loader.hydrate('5566', [contact('missing@lid')])
    await loader.hydrate('5566', [contact('missing@lid')])

    expect(fetchPicture).toHaveBeenCalledTimes(1)
  })

  test('retries a missing picture after the local miss TTL expires', async () => {
    let now = 0
    const fetchPicture = jest.fn().mockResolvedValue(undefined)
    const loader = new ContactPictureLoader(fetchPicture, {
      missingTtlMs: 1_000,
      now: () => now,
      createObjectUrl: jest.fn(),
      revokeObjectUrl: jest.fn(),
    })

    await loader.hydrate('5566', [contact('missing@lid')])
    now = 999
    await loader.hydrate('5566', [contact('missing@lid')])
    now = 1_001
    await loader.hydrate('5566', [contact('missing@lid')])

    expect(fetchPicture).toHaveBeenCalledTimes(2)
  })

  test('refreshes and revokes a positive blob URL after its TTL expires', async () => {
    let now = 0
    let generated = 0
    const revokeObjectUrl = jest.fn()
    const fetchPicture = jest.fn().mockResolvedValue(new Blob(['picture']))
    const loader = new ContactPictureLoader(fetchPicture, {
      positiveTtlMs: 1_000,
      now: () => now,
      createObjectUrl: () => `blob:https://uno.test/${++generated}`,
      revokeObjectUrl,
    })

    await loader.hydrate('5566', [contact('1@lid')])
    now = 1_001
    const refreshed = contact('1@lid')
    await loader.hydrate('5566', [refreshed])

    expect(fetchPicture).toHaveBeenCalledTimes(2)
    expect(refreshed.picture).toBe('blob:https://uno.test/2')
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://uno.test/1')
  })

  test('limits parallel downloads for the visible page', async () => {
    let active = 0
    let peak = 0
    const fetchPicture = jest.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
      return new Blob(['picture'])
    })
    const loader = new ContactPictureLoader(fetchPicture, {
      concurrency: 2,
      createObjectUrl: (_blob) => `blob:https://uno.test/${fetchPicture.mock.calls.length}`,
      revokeObjectUrl: jest.fn(),
    })

    await loader.hydrate('5566', [contact('1@lid'), contact('2@lid'), contact('3@lid'), contact('4@lid')])

    expect(peak).toBe(2)
  })
})
