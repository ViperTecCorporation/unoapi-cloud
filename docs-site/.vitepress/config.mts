import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'pt-BR',
  title: 'ViperConnect Developers',
  description: 'Documentação oficial e referência interativa da API ViperConnect.',
  cleanUrls: true,
  // The documentation image intentionally does not install Git. Keeping this
  // disabled also lets VitePress hot reload markdown files in that container.
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', href: '/viperconnect_icon.svg' }],
    ['meta', { name: 'theme-color', content: '#9d3836' }],
  ],
  themeConfig: {
    logo: '/viperconnect_icon.svg',
    siteTitle: 'ViperConnect Developers',
    nav: [
      { text: 'Guias', link: '/guide/installation' },
      { text: 'Telefonia', link: '/guide/telephony' },
      { text: 'API', link: '/api-reference' },
      { text: 'GitHub', link: 'https://github.com/ViperTecCorporation/ViperConnect' },
    ],
    sidebar: [
      {
        text: 'Comece aqui',
        items: [
          { text: 'Visão geral', link: '/' },
          { text: 'Instalação', link: '/guide/installation' },
          { text: 'Instalador Linux', link: '/guide/install-native-linux' },
          { text: 'Telefonia Linux nativa', link: '/guide/install-voip-native-linux' },
          { text: 'Docker Compose', link: '/guide/docker-compose' },
          { text: 'Docker Swarm', link: '/guide/docker-swarm' },
          { text: 'Conectar uma sessão', link: '/guide/connection' },
          { text: 'Arquitetura e cobertura', link: '/guide/architecture' },
          { text: 'Telefonia Zapo', link: '/guide/telephony' },
        ],
      },
      {
        text: 'Integração',
        items: [
          { text: 'Mensagens', link: '/guide/messages' },
          { text: 'Contatos', link: '/guide/contacts' },
          { text: 'Webhooks', link: '/guide/webhooks' },
          { text: 'Referência da API', link: '/api-reference' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/ViperTecCorporation/ViperConnect' }],
    footer: { message: 'ViperConnect by ViperTec Corporation' },
  },
})
