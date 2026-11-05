<script setup>
import { computed, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { currentUser, fetchPages, logout, notice } from './api.js';
import SiteFooter from './components/SiteFooter.vue';
import UserSettings from './components/UserSettings.vue';
import { BUILT_IN_PAGES } from './router.js';
import { useCachedItem } from './useCachedItem.js';

const route = useRoute();
const settings = useTemplateRef('settings');

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
    <RouterLink to="/" class="wordmark" aria-label="國立彰化師範大學資源教室首頁">
      <img src="/logo.webp" width="776" height="140" alt="" />
      <span class="wordmark__unit">資源教室</span>
    </RouterLink>
    <div class="site-header__menus">
      <nav class="utility-nav" aria-label="輔助選單">
        <RouterLink to="/" exact-active-class="is-current">首頁</RouterLink>
        <RouterLink to="/map" active-class="is-current">位置圖</RouterLink>
        <RouterLink to="/documents" active-class="is-current">文件下載</RouterLink>
        <RouterLink to="/contact" active-class="is-current">聯絡我們</RouterLink>
        <template v-if="currentUser">
          <RouterLink to="/pages" active-class="is-current">所有頁面</RouterLink>
          <span class="admin-status">{{ currentUser.username }} 已登入</span>
          <button type="button" class="button button--small button--quiet" @click="settings.open()">帳號設定</button>
          <button type="button" class="button button--small button--quiet" @click="signOut">登出</button>
        </template>
        <RouterLink
          v-else
          class="login-link"
          :to="{ path: '/login', query: route.path === '/login' ? {} : { redirect: route.fullPath } }"
        >登入</RouterLink>
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
