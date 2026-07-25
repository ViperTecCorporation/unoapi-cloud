import { icon } from './icons.js?v=4.0.0-beta8';
import { escapeHtml } from '../core/html.js?v=4.0.0-beta8';
const renderVersionStatus = (status) => {
    const installed = status.installed_version ? `v${status.installed_version.replace(/^v/i, '')}` : 'Versão';
    if (status.status === 'update_available') {
        const latest = `v${`${status.latest_version || ''}`.replace(/^v/i, '')}`;
        const iconContent = status.release_url
            ? `<a class="workspace__icon workspace__icon--update" href="${escapeHtml(status.release_url)}" target="_blank" rel="noopener" title="Abrir ${escapeHtml(latest)}">${icon('arrowUp')}</a>`
            : `<span class="workspace__icon workspace__icon--update">${icon('arrowUp')}</span>`;
        return `${iconContent}<span class="workspace__copy"><strong>${escapeHtml(installed)}</strong><small>${escapeHtml(latest)} disponível</small></span>`;
    }
    if (status.status === 'current') {
        return `<span class="workspace__icon workspace__icon--current" title="Versão mais atual">${icon('check')}</span><span class="workspace__copy"><strong>${escapeHtml(installed)}</strong><small>Versão mais atual</small></span>`;
    }
    return `<span class="workspace__icon workspace__icon--unknown" title="Verificação indisponível">${icon('refresh')}</span><span class="workspace__copy"><strong>${escapeHtml(installed)}</strong><small>${status.installed_version ? 'Não foi possível verificar' : 'Verificando atualização…'}</small></span>`;
};
export const renderLayout = ({ content, collapsed, mobileOpen, versionStatus }) => `
  <div class="app-shell ${collapsed ? 'app-shell--collapsed' : ''} ${mobileOpen ? 'app-shell--mobile-open' : ''}">
    <aside class="sidebar" aria-label="Navegação principal">
      <div class="brand">
        <img class="brand__logo" src="/logos/viperconnect_icon.svg" alt="ViperConnect">
        <span class="brand__copy"><strong>ViperConnect</strong><small>WhatsApp Hub</small></span>
      </div>
      <nav class="sidebar__nav">
        <button class="nav-item nav-item--active" type="button" data-action="go-dashboard" title="Dashboard">
          ${icon('dashboard')}<span>Dashboard</span>
        </button>
        <a class="nav-item" href="/docs" title="Documentação">
          ${icon('docs')}<span>Documentação</span>
        </a>
      </nav>
      <div class="sidebar__footer">
        <button class="nav-item" type="button" data-action="toggle-theme" title="Alternar tema">
          ${icon('theme')}<span>Tema</span>
        </button>
        <a class="nav-item" href="https://github.com/ViperTecCorporation/ViperConnect" target="_blank" rel="noopener" title="GitHub">
          ${icon('github')}<span>GitHub</span>
        </a>
        <button class="nav-item" type="button" data-action="logout" title="Sair">
          ${icon('logout')}<span>Sair</span>
        </button>
        <div class="workspace">
          ${renderVersionStatus(versionStatus)}
          <button class="btn btn--icon btn--ghost sidebar__toggle" type="button" data-action="toggle-sidebar" aria-label="${collapsed ? 'Expandir menu' : 'Recolher menu'}">
            ${icon(collapsed ? 'expand' : 'collapse')}
          </button>
        </div>
      </div>
    </aside>
    <div class="mobile-header">
      <div class="brand">
        <img class="brand__logo" src="/logos/viperconnect_icon.svg" alt="">
        <span class="brand__copy"><strong>ViperConnect</strong></span>
      </div>
      <div class="actions">
        <a class="btn btn--icon btn--ghost" href="https://github.com/ViperTecCorporation/ViperConnect" target="_blank" rel="noopener" aria-label="GitHub">${icon('github')}</a>
        <button class="btn btn--icon btn--ghost" type="button" data-action="toggle-mobile-menu" aria-label="Abrir menu">${icon('menu')}</button>
      </div>
    </div>
    <main class="main">${content}</main>
  </div>
`;
export const renderLogin = (error = '') => `
  <main class="login-shell">
    <section class="login-panel">
      <div class="login-brand" aria-label="ViperConnect">
        <img class="login-brand__icon" src="/logos/viperconnect_icon.svg" alt="">
        <strong>ViperConnect</strong>
      </div>
      <div>
        <span class="eyebrow">Painel de gerenciamento</span>
        <h1>Acesse suas sessões</h1>
        <p class="muted">Informe o token configurado no ViperConnect.</p>
      </div>
      <form class="stack" data-form="login">
        <label class="field">
          <span>Token de acesso</span>
          <input name="token" type="password" autocomplete="current-password" required autofocus>
        </label>
        ${error ? `<p class="form-error" role="alert">${error}</p>` : ''}
        <button class="btn btn--block" type="submit">Entrar</button>
      </form>
    </section>
  </main>
`;
