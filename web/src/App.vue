<script setup>
import { computed, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { can, currentUser, fetchPages, logout, notice } from './api.js';
import SiteFooter from './components/SiteFooter.vue';
import UserSettings from './components/UserSettings.vue';
import { BUILT_IN_PAGES } from './router.js';
import { siteConfig, siteImage } from './siteConfig.js';
import { themeMode, toggleTheme } from './theme.js';
import { useCachedItem } from './useCachedItem.js';

const route = useRoute();
const settings = useTemplateRef('settings');
const logo = siteImage('logoUrl');

// 管理員另外新增的頁面接在主選單後面
const { item: pages } = useCachedItem(() => 'pages', fetchPages);
const customPages = computed(() => (pages.value ?? []).filter((page) => !(page.slug in BUILT_IN_PAGES)));

async function signOut() {
  try {
    await logout();
  } catch (error) {
    window.alert(error.message);
  }
}
</script>

<template>
  <a class="skip-link" href="#main">跳到主要內容</a>
  <div class="path" aria-hidden="true"><div class="path__fill"></div></div>

  <header class="site-header">
    <RouterLink to="/" class="wordmark" :aria-label="`${siteConfig?.siteTitle ?? ''}首頁`">
      <img :src="logo" width="776" height="140" alt="" />
      <span v-if="siteConfig?.logoText" class="wordmark__unit">{{ siteConfig.logoText }}</span>
    </RouterLink>
    <div class="site-header__menus">
      <nav class="utility-nav" aria-label="輔助選單">
        <RouterLink to="/" exact-active-class="is-current">首頁</RouterLink>
        <RouterLink to="/map" active-class="is-current">位置圖</RouterLink>
        <RouterLink to="/documents" active-class="is-current">文件下載</RouterLink>
        <template v-if="currentUser">
          <RouterLink to="/pages" active-class="is-current">所有頁面</RouterLink>
          <RouterLink v-if="can('MANAGE_SITE_CONFIG')" to="/settings" active-class="is-current">網站設定</RouterLink>
          <span class="admin-status">{{ currentUser.username }} 已登入</span>
          <button type="button" class="button button--small button--quiet" @click="settings.open()">帳號設定</button>
          <button type="button" class="button button--small button--quiet" @click="signOut">登出</button>
        </template>
        <RouterLink
          v-else
          class="login-link"
          :to="{ path: '/login', query: route.path === '/login' ? {} : { redirect: route.fullPath } }"
        >登入</RouterLink>
        <!-- 名稱固定，按下狀態表示是否為深色；圖示顯示按下後會切換成的主題 -->
        <button
          type="button"
          class="theme-toggle"
          aria-label="深色模式"
          :aria-pressed="themeMode === 'dark'"
          :title="themeMode === 'dark' ? '切換成淺色模式' : '切換成深色模式'"
          @click="toggleTheme"
        >
          <svg v-if="themeMode === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" />
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          </svg>
        </button>
      </nav>
      <nav class="main-nav" aria-label="主選單">
        <RouterLink to="/about" active-class="is-current">資源教室簡介</RouterLink>
        <RouterLink to="/services" active-class="is-current">服務項目</RouterLink>
        <RouterLink to="/announcements" active-class="is-current">最新消息</RouterLink>
        <RouterLink to="/members" active-class="is-current">成員介紹</RouterLink>
        <RouterLink to="/regulations" active-class="is-current">法令規章</RouterLink>
        <RouterLink to="/photos" active-class="is-current">活動剪影</RouterLink>
        <RouterLink v-for="page in customPages" :key="page.slug" :to="`/pages/${page.slug}`" active-class="is-current">{{ page.title }}</RouterLink>
      </nav>
    </div>
  </header>

  <main id="main" tabindex="-1">
    <RouterView />
  </main>

  <SiteFooter />
  <UserSettings v-if="currentUser" ref="settings" />

  <p class="toast" :class="{ 'is-visible': notice }" role="status">{{ notice }}</p>
</template>
