import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const docsSite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(docsSite, '..')
const output = path.join(docsSite, 'public', 'examples')

const examples = [
  'docker-compose.unoapi-nginx.yml',
  'docker-compose.unoapi-traefik.yml',
]

await mkdir(output, { recursive: true })
for (const filename of examples) {
  const source = await readFile(path.join(root, 'docs', 'examples', filename), 'utf8')
  const publicContent = source
    .split(/\r?\n/)
    .filter((line) => !line.includes('EMBEDDED_SIGNUP_'))
    .join('\n')
  await writeFile(path.join(output, filename), publicContent)
}

console.log(`Exemplos de implantação sincronizados: ${examples.length}`)
