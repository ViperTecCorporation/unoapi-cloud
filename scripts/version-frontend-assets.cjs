const fs = require('fs')
const path = require('path')

const versionModuleImports = (source, version) =>
  source.replace(
    /((?:from\s+|import\s*)['"])(\.{1,2}\/[^'"]+\.js)(?:\?v=[^'"]*)?(['"])/g,
    (_match, prefix, asset, suffix) => `${prefix}${asset}?v=${encodeURIComponent(version)}${suffix}`,
  )

const versionIndexAssets = (source, version) =>
  source.replace(
    /((?:href|src)=")(\/app\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?(")/g,
    (_match, prefix, asset, suffix) => `${prefix}${asset}?v=${encodeURIComponent(version)}${suffix}`,
  )

const listJavaScriptFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return listJavaScriptFiles(target)
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : []
  })

const versionFrontendAssets = ({ appRoot, indexFile, version }) => {
  if (!version) throw new Error('frontend_asset_version_required')
  for (const file of listJavaScriptFiles(appRoot)) {
    const source = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, versionModuleImports(source, version))
  }
  const index = fs.readFileSync(indexFile, 'utf8')
  fs.writeFileSync(indexFile, versionIndexAssets(index, version))
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..')
  const pkg = require(path.join(projectRoot, 'package.json'))
  versionFrontendAssets({
    appRoot: path.join(projectRoot, 'public', 'app'),
    indexFile: path.join(projectRoot, 'public', 'index.html'),
    version: process.env.FRONTEND_ASSET_VERSION || pkg.version,
  })
}

module.exports = {
  versionFrontendAssets,
  versionIndexAssets,
  versionModuleImports,
}
