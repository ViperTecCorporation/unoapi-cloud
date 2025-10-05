import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

const yamlPath = path.resolve('docs/openapi.yaml')
const jsonPath = path.resolve('docs/openapi.json')

try {
  if (!fs.existsSync(yamlPath)) {
    console.error('openapi-to-json: docs/openapi.yaml not found; skipping')
    process.exit(0)
  }
  const raw = fs.readFileSync(yamlPath, 'utf-8')
  const obj = YAML.parse(raw)
  fs.writeFileSync(jsonPath, JSON.stringify(obj, null, 2))
  console.log('openapi-to-json: wrote', jsonPath)
} catch (e) {
  console.error('openapi-to-json: failed to generate JSON from YAML:', e?.message || e)
  process.exit(1)
}

