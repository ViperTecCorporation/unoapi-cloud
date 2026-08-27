import DefaultTheme from 'vitepress/theme'
import ScalarReference from './ApiReference.vue'
import DocsHome from './DocsHome.vue'
import DocsHomeEn from './DocsHomeEn.vue'
import Layout from './Layout.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('ScalarReference', ScalarReference)
    app.component('DocsHome', DocsHome)
    app.component('DocsHomeEn', DocsHomeEn)
    if (typeof window !== 'undefined') {
      const embedded = new URLSearchParams(window.location.search).get('embedded') === 'true'
      document.documentElement.dataset.embedded = embedded ? 'true' : 'false'
    }
  },
}
