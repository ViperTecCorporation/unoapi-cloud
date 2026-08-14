<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import '@scalar/api-reference/style.css'
import { managerOriginFromBrowser, normalizeApiServerUrl, normalizeAuthorizationValue } from './api_reference_config.mjs'

const container = ref<HTMLElement>()
const loading = ref(true)
const error = ref('')
const settingsError = ref('')
const serverUrl = ref('')
const serverInput = ref('')
const tokenInput = ref('')
let cleanup: (() => void) | undefined
let openApiContent: Record<string, unknown> | undefined
let createReference: (typeof import('@scalar/api-reference'))['createApiReference'] | undefined
const SERVER_STORAGE_KEY = 'viperconnect_api_reference_server'
const scalarCss = `
.scalar-app {
  --scalar-font: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  --scalar-color-1: #242124;
  --scalar-color-2: #686268;
  --scalar-color-3: #918b91;
  --scalar-color-accent: #9d3836;
  --scalar-background-1: #fbfbfc;
  --scalar-background-2: #f5f3f4;
  --scalar-background-3: #ebe8ea;
  --scalar-background-accent: rgba(157, 56, 54, .1);
  --scalar-border-color: #e2dee1;
  --scalar-sidebar-background-1: #f7f5f6;
  --scalar-sidebar-item-hover-background: rgba(157, 56, 54, .07);
  --scalar-sidebar-color-active: #9d3836;
  --scalar-sidebar-border-color: #e2dee1;
  --scalar-radius: 8px;
  --scalar-radius-lg: 12px;
  --scalar-content-max-width: 1560px;
}
.dark .scalar-app,
.scalar-app.dark-mode {
  --scalar-color-1: #f4f1f2;
  --scalar-color-2: #b8b1b7;
  --scalar-color-3: #8f888e;
  --scalar-color-accent: #d66863;
  --scalar-background-1: #151416;
  --scalar-background-2: #1d1b1e;
  --scalar-background-3: #272428;
  --scalar-background-accent: rgba(214, 104, 99, .13);
  --scalar-border-color: #39353a;
  --scalar-sidebar-background-1: #191719;
  --scalar-sidebar-item-hover-background: rgba(214, 104, 99, .09);
  --scalar-sidebar-color-active: #e17b76;
  --scalar-sidebar-border-color: #39353a;
}
.scalar-api-reference {
  min-height: calc(100dvh - 137px) !important;
  --full-height: calc(100dvh - 137px) !important;
}
`

const renderReference = () => {
  if (!container.value || !openApiContent || !createReference || !serverUrl.value) return
  cleanup?.()
  container.value.replaceChildren()
  const authorization = normalizeAuthorizationValue(tokenInput.value)
  const instance = createReference(container.value, {
    content: openApiContent,
    theme: 'none',
    layout: 'modern',
    customCss: scalarCss,
    _integration: 'vue',
    hideModels: false,
    documentDownloadType: 'both',
    showSidebar: true,
    showDeveloperTools: 'always',
    darkMode: document.documentElement.classList.contains('dark'),
    hideDarkModeToggle: true,
    agent: { disabled: true },
    mcp: { disabled: true },
    modelsSectionLabel: 'Estruturas de dados',
    defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
    withDefaultFonts: false,
    persistAuth: false,
    servers: [{ url: serverUrl.value }],
    authentication: authorization
      ? {
          preferredSecurityScheme: 'ApiToken',
          securitySchemes: { ApiToken: { value: authorization } },
        }
      : { preferredSecurityScheme: 'ApiToken' },
  })
  cleanup = () => instance?.destroy?.()
}

const applySettings = (persistServer = true) => {
  try {
    const normalized = normalizeApiServerUrl(serverInput.value)
    serverUrl.value = normalized
    serverInput.value = normalized
    settingsError.value = ''
    if (persistServer) localStorage.setItem(SERVER_STORAGE_KEY, normalized)
    renderReference()
  } catch (cause) {
    settingsError.value = cause instanceof Error ? cause.message : 'Configuração inválida'
  }
}

const receiveManagerConfig = (event: MessageEvent) => {
  if (event.source !== window.parent || event.data?.type !== 'viperconnect:docs-config') return
  try {
    const managerUrl = normalizeApiServerUrl(event.data.apiUrl)
    if (new URL(managerUrl).origin !== event.origin) return
    serverInput.value = managerUrl
    tokenInput.value = typeof event.data.token === 'string' ? event.data.token : ''
    applySettings(false)
  } catch {}
}

onMounted(async () => {
  try {
    window.addEventListener('message', receiveManagerConfig)
    const response = await fetch('/openapi.json')
    if (!response.ok) throw new Error(`OpenAPI indisponível: HTTP ${response.status}`)
    openApiContent = await response.json()
    if (!openApiContent?.openapi || !openApiContent?.paths) throw new Error('O contrato OpenAPI é inválido')

    const scalar = await import('@scalar/api-reference')
    createReference = scalar.createApiReference
    const query = new URLSearchParams(window.location.search)
    const managerOrigin =
      window.parent === window
        ? ''
        : managerOriginFromBrowser({
            ancestorOrigin: window.location.ancestorOrigins?.[0],
            referrer: document.referrer,
          })
    serverInput.value = query.get('api_url') || managerOrigin || localStorage.getItem(SERVER_STORAGE_KEY) || window.location.origin
    applySettings(false)
    if (window.parent !== window) window.parent.postMessage({ type: 'viperconnect:docs-ready' }, '*')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar a referência'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', receiveManagerConfig)
  cleanup?.()
})
</script>

<template>
  <section class="api-reference-shell">
    <header class="api-reference-toolbar">
      <div>
        <span>REFERÊNCIA INTERATIVA</span>
        <strong>ViperConnect API</strong>
        <small>Endpoints sincronizados diretamente dos controllers</small>
      </div>
      <form class="api-reference-settings" @submit.prevent="applySettings()">
        <label>
          <span>Endpoint da instalação</span>
          <input v-model="serverInput" name="server" type="url" placeholder="https://unoapi.exemplo.com" required />
        </label>
        <label>
          <span>Token</span>
          <input v-model="tokenInput" name="token" type="password" autocomplete="off" placeholder="Token de acesso" />
        </label>
        <button type="submit">Aplicar</button>
        <a href="/openapi.json" download="viperconnect-openapi.json">↓ OpenAPI</a>
      </form>
    </header>
    <p v-if="settingsError" class="api-reference-settings-error" role="alert">{{ settingsError }}</p>
    <div v-if="loading" class="api-reference-state">Carregando referência da API…</div>
    <div v-if="error" class="api-reference-state api-reference-error">
      <strong>Não foi possível carregar a referência.</strong>
      <span>{{ error }}</span>
      <a href="/openapi.json" download="openapi.json">Baixar OpenAPI</a>
    </div>
    <div ref="container" class="scalar-host" />
  </section>
</template>
