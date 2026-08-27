<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import MobilePrimaryNav from './MobilePrimaryNav.vue'

const DefaultLayout = DefaultTheme.Layout
</script>

<template>
  <DefaultLayout>
    <template #sidebar-nav-before>
      <MobilePrimaryNav />
    </template>
  </DefaultLayout>
</template>
