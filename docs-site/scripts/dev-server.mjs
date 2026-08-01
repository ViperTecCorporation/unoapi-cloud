import { readdirSync, statSync, watchFile } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const docsSite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(docsSite, '..')
const node = process.execPath

const run = (script) => new Promise((resolve, reject) => {
  const child = spawn(node, [script], { cwd: root, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)))
})

let syncTask = Promise.resolve()
let timer
const scheduleSync = (kind) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    syncTask = syncTask
      .then(async () => {
        if (kind === 'openapi-yaml') await run('scripts/openapi-to-json.mjs')
        await run(kind === 'examples'
          ? 'docs-site/scripts/sync-deployment-examples.mjs'
          : 'docs-site/scripts/sync-openapi.mjs')
      })
      .catch((error) => console.error('[docs:sync]', error.message))
  }, 200)
}

await run('scripts/openapi-to-json.mjs')
await run('docs-site/scripts/sync-openapi.mjs')
await run('docs-site/scripts/sync-deployment-examples.mjs')

const watched = [
  ['docs/openapi.yaml', 'openapi-yaml'],
  ['docs/openapi.json', 'openapi-json'],
  ['src/router.ts', 'router'],
]
for (const file of readdirSync(path.join(root, 'docs/examples'))) {
  watched.push([`docs/examples/${file}`, 'examples'])
}
for (const [target, kind] of watched) {
  const file = path.join(root, target)
  let previous = statSync(file).mtimeMs
  watchFile(file, { interval: 500, persistent: false }, (current) => {
    if (current.mtimeMs === previous) return
    previous = current.mtimeMs
    scheduleSync(kind)
  })
}

const vitepress = path.join(docsSite, 'node_modules/vitepress/bin/vitepress.js')
const server = spawn(node, [
  vitepress,
  'dev',
  docsSite,
  '--host',
  '0.0.0.0',
  '--port',
  '8080',
], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal))
}

server.once('exit', (code) => process.exit(code ?? 0))
