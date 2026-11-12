<script setup>
import { computed } from 'vue';
import { EXTENSIONS } from '../extensions/index.js';
import { isExtensionEnabled, siteConfig, siteImage } from '../siteConfig.js';

// 啟用中的擴充功能提供的區塊，例如最新消息、活動剪影
const sections = computed(() => EXTENSIONS.filter((extension) => extension.home && isExtensionEnabled(extension.key)));
const campus = siteImage('campusUrl');

// 警示磚的點陣；動畫從左下角、也就是引導線的起點擴散開來
const COLUMNS = 9;
const ROWS = 7;
const dots = Array.from({ length: COLUMNS * ROWS }, (_, i) => {
  const column = i % COLUMNS;
  const row = Math.floor(i / COLUMNS);
  return Math.round(Math.hypot(column, ROWS - 1 - row));
});
</script>

<template>
  <section class="hero" aria-labelledby="site-title">
    <div class="hero__text">
      <h1 id="site-title">
        <span v-if="siteConfig?.heroPrefix" class="hero__school">{{ siteConfig.heroPrefix }}</span>
        <span class="hero__unit">{{ siteConfig?.heroTitle }}</span>
      </h1>
      <p v-if="siteConfig?.heroText" class="hero__hours">{{ siteConfig.heroText }}</p>
    </div>
    <div class="hero__media">
      <div class="hero__dots" aria-hidden="true">
        <i v-for="(distance, i) in dots" :key="i" :style="{ '--distance': distance }"></i>
      </div>
      <img v-if="siteConfig" :src="campus" width="841" height="559" fetchpriority="high" :alt="siteConfig.campusAlt" />
    </div>
  </section>

  <div v-if="sections.length" class="page">
    <component :is="extension.home" v-for="extension in sections" :key="extension.key" />
  </div>
</template>
