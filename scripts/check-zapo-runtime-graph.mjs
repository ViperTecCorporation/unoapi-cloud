import fs from 'node:fs'
import path from 'node:path'

const runtimeRoot = path.resolve('dist/src')
const forbiddenArtifacts = [
  'services/client_baileys.js',
  'services/listener_baileys.js',
  'services/socket.js',
  'services/auth_state.js',
  'services/store_file.js',
  'services/data_store_file.js',
]

const pendingDirectories = [runtimeRoot]
const javascriptFiles = []
while (pendingDirectories.length) {
  const directory = pendingDirectories.pop()
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) pendingDirectories.push(entryPath)
    else if (entry.isFile() && entry.name.endsWith('.js')) javascriptFiles.push(entryPath)
  }
}

const staticBaileysImport = /require\(\s*['"]@whiskeysockets\/baileys(?:\/[^'"]*)?['"]\s*\)/
const importViolations = javascriptFiles
  .filter((file) => staticBaileysImport.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(runtimeRoot, file))
const artifactViolations = forbiddenArtifacts.filter((file) => fs.existsSync(path.join(runtimeRoot, file)))

if (importViolations.length || artifactViolations.length) {
  const violations = [
    ...importViolations.map((file) => `static Baileys import: ${file}`),
    ...artifactViolations.map((file) => `legacy artifact: ${file}`),
  ]
  throw new Error(`Zapo runtime contains Baileys code:\n${violations.join('\n')}`)
}

console.log('Zapo runtime graph verified: Baileys is not reachable.')
