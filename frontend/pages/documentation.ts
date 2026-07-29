import { escapeHtml } from '../core/html.js'
import { t } from '../core/i18n.js'

export const DOCUMENTATION_URL = 'https://viperconnect.vipertec.net/'

export const renderDocumentationPage = (): string => `
  <section class="documentation-embed" aria-label="${escapeHtml(t('Documentação'))}">
    <iframe
      class="documentation-embed__frame"
      src="${DOCUMENTATION_URL}"
      title="${escapeHtml(t('Documentação'))}"
      loading="eager"
      referrerpolicy="strict-origin-when-cross-origin"
    >
      <a href="${DOCUMENTATION_URL}" target="_blank" rel="noopener">${escapeHtml(t('Documentação'))}</a>
    </iframe>
  </section>
`
