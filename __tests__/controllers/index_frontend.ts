import fs from 'fs'
import path from 'path'
import { resolvePublicAppAsset } from '../../src/controllers/index_controller'

describe('frontend delivery', () => {
  test('resolves generated frontend assets inside the public app directory', () => {
    const target = resolvePublicAppAsset('main.js')

    expect(target).toBe(path.resolve('./public/app/main.js'))
    expect(fs.existsSync(path.resolve('./frontend/main.ts'))).toBe(true)
  })

  test('rejects traversal outside the public app directory', () => {
    expect(resolvePublicAppAsset('../index.html')).toBeUndefined()
    expect(resolvePublicAppAsset('../../package.json')).toBeUndefined()
  })

  test('serves the modular frontend without legacy UI dependencies', () => {
    const html = fs.readFileSync(path.resolve('./public/index.html'), 'utf8')

    expect(html).toContain('/app/main.js')
    expect(html).toContain('/app/styles.css')
    expect(html).not.toMatch(/jquery|bootstrap|datatables/i)
  })
})
