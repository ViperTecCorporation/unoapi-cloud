import { versionIndexAssets, versionModuleImports } from '../../scripts/version-frontend-assets.cjs'

describe('frontend asset versioning', () => {
  test('versions static entry assets and replaces an older version', () => {
    const html = '<link href="/app/styles.css?v=old"><script src="/app/main.js"></script>'

    expect(versionIndexAssets(html, '4.0.0-beta8')).toBe(
      '<link href="/app/styles.css?v=4.0.0-beta8"><script src="/app/main.js?v=4.0.0-beta8"></script>',
    )
  })

  test('versions every relative JavaScript module import idempotently', () => {
    const source = ["import { ApiClient } from './core/api.js'", "import '../components/layout.js?v=old'"].join('\n')

    const versioned = versionModuleImports(source, '4.0.0-beta8')
    expect(versioned).toContain("from './core/api.js?v=4.0.0-beta8'")
    expect(versioned).toContain("import '../components/layout.js?v=4.0.0-beta8'")
    expect(versionModuleImports(versioned, '4.0.0-beta8')).toBe(versioned)
  })
})
