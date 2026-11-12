<script setup>
import { computed, useTemplateRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { can, currentUser, logout, notice } from './api.js';
import LoginDialog from './components/LoginDialog.vue';
import SiteFooter from './components/SiteFooter.vue';
import UserSettings from './components/UserSettings.vue';
import { isDisabledRoute } from './router.js';
import NotFound from './views/NotFound.vue';
import { DEFAULT_NAVIGATION, mapMenus, menuLink } from './navigation.js';
import { navigation, siteConfig, siteImage } from './siteConfig.js';
import { themeMode, toggleTheme } from './theme.js';
import { useDropdown } from './useDropdown.js';

const route = useRoute();
const router = useRouter();
const settings = useTemplateRef('settings');
const loginDialog = useTemplateRef('loginDialog');

// 舊的 /login 連結會轉到 ?login=1（見 router.js）：開啟登入視窗，並把網址還原
watch(() => route.query.login, async (value) => {
  if (value === undefined) return;
  const { login: _, ...query } = route.query;
  await router.replace({ query });
  if (!currentUser.value) loginDialog.value?.open();
});
const logo = siteImage('logoUrl');

// 選單的內容在網站設定排列；載入前先顯示預設的網站功能
const menus = computed(() => mapMenus(navigation.value ?? DEFAULT_NAVIGATION, menuLink));

// 窄螢幕時選單收進「選單」按鈕；帳號相關的功能收在帳號名稱的選單
const { open: menuOpen, toggle: toggleMenu, close: closeMenu } = useDropdown('menu');
const { open: accountOpen, toggle: toggleAccount, close: closeAccount } = useDropdown('account');

const NAV_LABELS = { utility: '輔助選單', main: '主選單' };

/** 連結在底下的頁面（例如單則公告）也標示；首頁 / 只符合自己 */
const isCurrent = (to) => route.path === to || route.path.startsWith(`${to}/`);

/** 點選單裡的連結就收起，連到目前所在的頁面時也一樣 */
function closeOnLink(event, close) {
  if (event.target.closest('a')) close();
}

function openSettings() {
  closeAccount();
  settings.value.open();
}

async function signOut() {
  closeAccount();
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

    <div class="site-header__tools">
      <RouterLink v-if="can('MANAGE_PAGES')" class="login-link" to="/pages?new=1">新增頁面</RouterLink>
      <div v-if="currentUser" ref="account" class="dropdown" @click="closeOnLink($event, closeAccount)">
        <button
          type="button"
          class="account-toggle"
          :aria-label="`帳號選單：${currentUser.username}`"
          aria-controls="account-menu"
          :aria-expanded="accountOpen"
          @click="toggleAccount"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
          <span class="account-toggle__name">{{ currentUser.username }}</span>
          <svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <ul v-show="accountOpen" id="account-menu" class="dropdown__menu" aria-label="帳號選單">
          <li><RouterLink to="/pages" active-class="is-current">所有頁面</RouterLink></li>
          <li v-if="can('MANAGE_SITE_CONFIG')"><RouterLink to="/settings" active-class="is-current">網站設定</RouterLink></li>
          <li v-if="can('MANAGE_SITE_CONFIG')"><RouterLink to="/extensions" active-class="is-current">擴充功能</RouterLink></li>
          <li><button type="button" @click="openSettings">帳號設定</button></li>
          <li><button type="button" @click="signOut">登出</button></li>
        </ul>
      </div>
      <button v-else type="button" class="login-link" @click="loginDialog.open()">登入</button>

      <!-- 名稱固定，按下狀態表示是否為深色；圖示顯示按下後會切換成的主題 -->
      <button
        type="button"
        class="icon-button"
        aria-label="深色模式"
        :aria-pressed="themeMode === 'dark'"
        :title="themeMode === 'dark' ? '切換成淺色模式' : '切換成深色模式'"
        @click="toggleTheme"
      >
        <svg v-if="themeMode === 'dark'" class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
        <svg v-else class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      </button>
    </div>

    <!-- 寬螢幕時按鈕隱藏、選單直接排在頁首；display: contents 讓按鈕與選單各自放進頁首的格線 -->
    <div ref="menu" class="site-header__nav">
      <button
        type="button"
        class="menu-toggle"
        aria-label="選單"
        aria-controls="site-menus"
        :aria-expanded="menuOpen"
        @click="toggleMenu"
      >
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path v-if="menuOpen" d="M6 6l12 12M18 6 6 18" />
          <path v-else d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <span class="menu-toggle__label">選單</span>
      </button>
      <div id="site-menus" class="site-header__menus" :class="{ 'is-open': menuOpen }" @click="closeOnLink($event, closeMenu)">
        <template v-for="(label, row) in NAV_LABELS" :key="row">
          <nav v-if="menus[row].length" :class="`${row}-nav`" :aria-label="label">
            <RouterLink
              v-for="link in menus[row]"
              :key="link.key"
              :to="link.to"
              :class="{ 'is-current': isCurrent(link.to) }"
            >{{ link.label }}</RouterLink>
          </nav>
        </template>
      </div>
    </div>
  </header>

  <!-- 預設密碼是公開的：更改之前一直顯示，不像操作提示會自動消失 -->
  <p v-if="currentUser?.usesDefaultPassword" class="warning-bar" role="alert">
    這個帳號還在使用預設密碼，任何人都可以用它登入。
    <button type="button" @click="openSettings">立刻更改密碼</button>
  </p>

  <main id="main" tabindex="-1">
    <RouterView v-slot="{ Component, route: current }">
      <NotFound v-if="isDisabledRoute(current)" />
      <component :is="Component" v-else />
    </RouterView>
  </main>

  <SiteFooter />
  <UserSettings v-if="currentUser" ref="settings" />
  <LoginDialog v-else ref="loginDialog" />

  <p class="toast" :class="{ 'is-visible': notice }" role="status">{{ notice }}</p>
</template>
