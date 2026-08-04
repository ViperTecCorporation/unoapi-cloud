import { escapeHtml } from '../core/html.js?v=4.0.6-7a098242';
import { t } from '../core/i18n.js?v=4.0.6-7a098242';
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
