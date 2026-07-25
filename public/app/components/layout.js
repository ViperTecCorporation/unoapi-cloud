import { icon } from './icons.js?v=4.0.0-beta8';
export const renderLayout = ({ content, collapsed, mobileOpen }) => `
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
          <span class="workspace__icon">${icon('message')}</span>
          <span class="workspace__copy"><strong>Viper Tec</strong><small>Produção</small></span>
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
