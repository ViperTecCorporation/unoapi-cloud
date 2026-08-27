<script setup lang="ts">
import { computed } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'

const { lang, theme } = useData()
const route = useRoute()

const label = computed(() => lang.value.startsWith('en') ? 'Main navigation' : 'Navegação principal')
const links = computed(() => (theme.value.nav ?? []).flatMap((item) => {
  if (!('link' in item)) return []

  return [{
    text: item.text,
    link: item.link,
    external: /^https?:\/\//.test(item.link),
  }]
}))

const normalizePath = (path: string) => path.replace(/\.html$/, '').replace(/\/$/, '') || '/'
const href = (link: string) => /^https?:\/\//.test(link) ? link : withBase(link)
const isActive = (link: string) => !/^https?:\/\//.test(link)
  && normalizePath(route.path) === normalizePath(link)
</script>

<template>
  <section class="mobile-primary-nav" aria-labelledby="mobile-primary-nav-label">
    <p id="mobile-primary-nav-label" class="mobile-primary-nav__label">{{ label }}</p>
    <a
      v-for="item in links"
      :key="item.link"
      class="mobile-primary-nav__link"
      :class="{ 'is-active': isActive(item.link) }"
      :href="href(item.link)"
      :target="item.external ? '_blank' : undefined"
      :rel="item.external ? 'noreferrer' : undefined"
    >
      {{ item.text }}
      <span v-if="item.external" aria-hidden="true">↗</span>
    </a>
  </section>
</template>

<style scoped>
.mobile-primary-nav {
  display: grid;
  gap: 2px;
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.mobile-primary-nav__label {
  margin: 0 0 6px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.mobile-primary-nav__link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  padding: 7px 10px;
  border-radius: 7px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}

.mobile-primary-nav__link:hover,
.mobile-primary-nav__link.is-active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

@media (min-width: 960px) {
  .mobile-primary-nav {
    display: none;
  }
}
</style>
