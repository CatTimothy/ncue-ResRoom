import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { canAnimate } from './motion.js';
import { focusMain } from './page.js';
import { setTitle } from './siteConfig.js';
import Album from './views/Album.vue';
import Albums from './views/Albums.vue';
import Announcement from './views/Announcement.vue';
import Announcements from './views/Announcements.vue';
import Documents from './views/Documents.vue';
import Home from './views/Home.vue';
import Login from './views/Login.vue';
import NotFound from './views/NotFound.vue';
import Pages from './views/Pages.vue';
import PageView from './views/PageView.vue';
import SiteSettings from './views/SiteSettings.vue';

/** 在選單上有固定位置的頁面 */
export const BUILT_IN_PAGES = {
  about: '資源教室簡介',
  services: '服務項目',
  members: '成員介紹',
  regulations: '法令規章',
  map: '位置圖',
  contact: '聯絡我們',
};

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    ...Object.entries(BUILT_IN_PAGES).map(([slug, title]) => ({
      path: `/${slug}`,
      component: PageView,
      props: { slug, fallbackTitle: title },
      meta: { title },
    })),
    { path: '/announcements', component: Announcements, meta: { title: '最新消息' } },
    { path: '/announcements/:id', component: Announcement, props: true, meta: { title: '最新消息' } },
    { path: '/photos', component: Albums, meta: { title: '活動剪影' } },
    { path: '/photos/:id', component: Album, props: true, meta: { title: '活動剪影' } },
    { path: '/documents', component: Documents, meta: { title: '文件下載' } },
    { path: '/pages', component: Pages, meta: { title: '所有頁面' } },
    { path: '/pages/:slug', component: PageView, props: true },
    { path: '/settings', component: SiteSettings, meta: { title: '網站設定' } },
    { path: '/login', component: Login, meta: { title: '管理員登入' } },
    { path: '/:rest(.*)*', component: NotFound, meta: { title: '找不到頁面' } },
  ],
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved;
    if (to.hash) return { el: to.hash };
    return to.path === from.path ? false : { top: 0 }; // 打字搜尋時畫面不跳動
  },
});

// 只有路徑改變才算換頁：搜尋會改網址的查詢字串，不能搶走輸入框的焦點
const isPageChange = (to, from) => from.matched.length > 0 && !to.hash && to.path !== from.path;

// 換頁轉場：瀏覽器先拍下舊畫面，再讓路由更新；畫面更新後 finishTransition 才結束
let finishTransition = null;

router.beforeResolve((to, from) => {
  if (!isPageChange(to, from) || !canAnimate()) return;
  return new Promise((resolve) => {
    const root = document.documentElement;
    root.classList.add('is-routing');
    const transition = document.startViewTransition(() => new Promise((done) => {
      finishTransition = done;
      resolve();
    }));
    transition.finished.finally(() => root.classList.remove('is-routing'));
  });
});

// 換頁時更新標題，並把焦點移到內容開頭，讓鍵盤與螢幕報讀軟體使用者知道頁面已更換
router.afterEach((to, from) => {
  if (to.path !== from.path) setTitle(to.meta.title);
  nextTick(() => {
    finishTransition?.();
    finishTransition = null;
    if (isPageChange(to, from)) focusMain();
  });
});
