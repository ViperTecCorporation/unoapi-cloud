import { escapeHtml } from '../core/html.js?v=4.0.17-91432cf3';
import { t } from '../core/i18n.js?v=4.0.17-91432cf3';
export const DOCUMENTATION_URL = 'https://viperconnect.vipertec.net/';
export const renderDocumentationPage = () => `
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
`;
