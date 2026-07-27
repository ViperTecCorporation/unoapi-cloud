import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(docs, '..')
const spec = JSON.parse(await readFile(path.join(docs, 'public', 'openapi.json'), 'utf8'))
const required = [
  '/sessions',
  '/{version}/{phone}/register',
  '/{version}/{phone}/messages',
  '/{phone}/request_code',
  '/{phone}/contacts',
  '/{version}/{phone}/groups',
]
for (const route of required) {
  if (!spec.paths[route]) throw new Error(`OpenAPI sem rota obrigatória: ${route}`)
}

const messageOperation = spec.paths['/{version}/{phone}/messages']?.post
for (const field of ['statusJidList', 'ttl', 'options']) {
  if (spec.components?.schemas?.MessageCommon?.properties?.[field]) {
    throw new Error(`MessageCommon não deve expor opção específica em todos os modelos: ${field}`)
  }
}
const messageSchemaRefs = new Set(
  (spec.components?.schemas?.MessageRequest?.oneOf || []).map((item) => item.$ref),
)
for (const schema of [
  'MessageText',
  'MessageStatusBroadcast',
  'MessageImage',
  'MessageAudio',
  'MessageDocument',
  'MessageReaction',
  'MessagePoll',
  'MessagePollVote',
  'MessageInteractiveButtons',
  'MessageInteractiveList',
  'MessageInteractiveCarousel',
  'MessagePaymentRequest',
  'MessageOrderDetails',
  'MessageOrderStatus',
  'MessageStatusUpdate',
]) {
  if (!messageSchemaRefs.has(`#/components/schemas/${schema}`)) {
    throw new Error(`MessageRequest sem contrato público: ${schema}`)
  }
}
const messageExamples = messageOperation?.requestBody?.content?.['application/json']?.examples || {}
for (const example of [
  'text',
  'expiringText',
  'image',
  'audio',
  'document',
  'statusImage',
  'reaction',
  'poll',
  'pollVote',
  'interactiveButtons',
  'interactiveList',
  'interactiveCarousel',
  'paymentPixStatic',
  'subscriptionBoletoPix',
  'orderStatus',
  'markAsRead',
  'deleteMessage',
]) {
  if (!messageExamples[example]) throw new Error(`Endpoint de mensagens sem exemplo: ${example}`)
}
for (const schema of ['MessageImage', 'MessageAudio', 'MessageDocument', 'MessageVideo', 'MessageSticker']) {
  const mediaType = schema.replace(/^Message/, '').toLowerCase()
  const branch = spec.components.schemas[schema]?.allOf?.[1]
  if (!branch?.required?.includes(mediaType) || !branch?.properties?.[mediaType]?.required?.includes('link')) {
    throw new Error(`${schema} deve exigir ${mediaType}.link`)
  }
}

const router = await readFile(path.join(root, 'src', 'router.ts'), 'utf8')
const ignoredRoute = /^(\/$|\/index\.html|\/socket\.io|min\.js|\/favicon|\/docs(?:\/|$)|\/app\/|\/logos\/|\/embedded|\/config\.js|\/embedded-callback)/
const unsupportedRoute = /oauth\/access_token|whatsapp_business_accounts|sessions\/meta\/mappings|subscribed_apps|message_templates|\/config\.js|debug_token|business_account_id|phone_number_id|\/invite_link$|^\/admin\/(?:redis|rabbitmq)\/|\/debug\/(?:auth_cache|privacy_)|\/jidmap(?:\/|$)/
const normalizeRoute = (value) => value
  .replace(/:([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?/g, '{$1}')
  .replace(/\*$/, '{path}')
const missing = []
for (const line of router.split(/\r?\n/)) {
  const match = line.match(/router\.(get|post|put|patch|delete)\('([^']+)'/)
  if (!match || ignoredRoute.test(match[2]) || unsupportedRoute.test(match[2])) continue
  const route = normalizeRoute(match[2])
  if (!spec.paths[route]?.[match[1]]) missing.push(`${match[1].toUpperCase()} ${route}`)
}
if (missing.length) throw new Error(`Rotas dos controllers ausentes no OpenAPI:\n${missing.join('\n')}`)

const markdown = []
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.vitepress', 'public', 'scripts'].includes(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(target)
    else if (entry.name.endsWith('.md')) markdown.push(target)
  }
}
await walk(docs)
for (const file of markdown) {
  const content = await readFile(file, 'utf8')
  if (/baileys/i.test(content)) throw new Error(`Termo interno exposto em ${path.relative(root, file)}`)
  if (/\bmeta(?:\s+cloud)?\b/i.test(content)) throw new Error(`Integração não suportada exposta em ${path.relative(root, file)}`)
}

const composeFiles = [
  path.join(docs, 'public', 'examples', 'docker-compose.unoapi-nginx.yml'),
  path.join(docs, 'public', 'examples', 'docker-compose.unoapi-traefik.yml'),
]
for (const composeFile of composeFiles) {
  const composeContent = await readFile(composeFile, 'utf8')
  const compose = parseYaml(composeContent)
  const app = compose.services?.unoapi
  const base = compose['x-base']
  if (base?.image !== 'ghcr.io/viperteccorporation/viperconnect:latest') {
    throw new Error(`Compose público usa imagem incorreta: ${path.basename(composeFile)}`)
  }
  if (base.entrypoint || base.command || app.entrypoint || app.command) {
    throw new Error(`Compose público substitui o entrypoint: ${path.basename(composeFile)}`)
  }
  const workerEnvironment = compose.services?.['unoapi-worker-zapo']?.environment
  if (workerEnvironment?.UNOAPI_PROCESS_ROLE !== 'worker' || workerEnvironment?.UNOAPI_WORKER_ENGINE !== 'zapo') {
    throw new Error(`Worker Zapo inválido: ${path.basename(composeFile)}`)
  }
  for (const service of ['unoapi', 'unoapi-broker', 'unoapi-worker-zapo', 'unoapi-redis', 'unoapi-rabbitmq']) {
    if (!compose.services?.[service]) {
      throw new Error(`${path.basename(composeFile)} sem serviço ${service}`)
    }
  }
  for (const volume of ['redis', 'rabbitmq']) {
    if (!Object.hasOwn(compose.volumes || {}, volume)) {
      throw new Error(`${path.basename(composeFile)} sem volume ${volume}`)
    }
  }
}
for (const file of composeFiles) {
  const content = await readFile(file, 'utf8')
  if (/baileys/i.test(content)) throw new Error(`Termo interno exposto em ${path.relative(root, file)}`)
  if (/\bmeta(?:\s+cloud)?\b/i.test(content)) throw new Error(`Integração fora do escopo exposta em ${path.relative(root, file)}`)
  if (/\b(?:voip|coturn)\b|worker-baileys|redis-commander|valkey-fix/i.test(content)) {
    throw new Error(`Serviço fora do escopo exposto em ${path.relative(root, file)}`)
  }
}
if (/baileys/i.test(JSON.stringify(spec))) throw new Error('Termo interno exposto no OpenAPI público')
if (/\bmeta(?:\s+cloud)?\b/i.test(JSON.stringify(spec))) throw new Error('Integração não suportada exposta no OpenAPI público')
for (const route of Object.keys(spec.paths)) {
  if (/embedded|subscribed_apps|message_templates|\/meta\//i.test(route)) {
    throw new Error(`Rota fora do escopo Zapo exposta: ${route}`)
  }
}
const allowedTags = new Set((spec.tags || []).map((item) => item.name))
const operationIds = new Set()
for (const [route, pathItem] of Object.entries(spec.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method]
    if (!operation) continue
    if (operation.tags?.length !== 1 || !allowedTags.has(operation.tags[0])) {
      throw new Error(`${method.toUpperCase()} ${route} possui agrupamento inválido`)
    }
    if (!operation.summary || /^(index|get|list|create|update|destroy|status|typebot|tree|remove tree)$/i.test(operation.summary)) {
      throw new Error(`${method.toUpperCase()} ${route} possui título genérico: ${operation.summary}`)
    }
    if (!operation.operationId || operationIds.has(operation.operationId)) {
      throw new Error(`${method.toUpperCase()} ${route} possui operationId ausente ou duplicado: ${operation.operationId}`)
    }
    operationIds.add(operation.operationId)
  }
}
const operations = Object.values(spec.paths).reduce(
  (total, pathItem) => total + Object.keys(pathItem).filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key)).length,
  0,
)
console.log(`Documentação validada: ${markdown.length} páginas, ${Object.keys(spec.paths).length} caminhos, ${operations} operações`)
