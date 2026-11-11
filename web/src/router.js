import { nextTick } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { canAnimate } from './motion.js';
import { BUILT_IN_PAGES, SERVICES } from './navigation.js';
import { focusMain, setTitle } from './page.js';
import Album from './views/Album.vue';
import Albums from './views/Albums.vue';
import Announcement from './views/Announcement.vue';
import Announcements from './views/Announcements.vue';
import Documents from './views/Documents.vue';
import Home from './views/Home.vue';
import NotFound from './views/NotFound.vue';
import Pages from './views/Pages.vue';
import PageView from './views/PageView.vue';
import SiteSettings from './views/SiteSettings.vue';

/** 只回到本站的路徑，避免被導向外部網站 */
const safeRedirect = (target) => (typeof target === 'string' && /^\/(?![/\\])/.test(target) ? target : '/');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: SERVICES.ANNOUNCEMENTS.to, component: Announcements, meta: { title: SERVICES.ANNOUNCEMENTS.label } },
    { path: `${SERVICES.ANNOUNCEMENTS.to}/:id`, component: Announcement, props: true, meta: { title: SERVICES.ANNOUNCEMENTS.label } },
    { path: SERVICES.PHOTOS.to, component: Albums, meta: { title: SERVICES.PHOTOS.label } },
    { path: `${SERVICES.PHOTOS.to}/:id`, component: Album, props: true, meta: { title: SERVICES.PHOTOS.label } },
    { path: SERVICES.DOCUMENTS.to, component: Documents, meta: { title: SERVICES.DOCUMENTS.label } },
    { path: '/pages', component: Pages, meta: { title: '所有頁面' } },
    // 頁面的網址：/pages/<slug>，或設定在第一層的 /<slug>（見 navigation.js 的 pagePath）
    {
      path: '/pages/:slug',
      component: PageView,
      props: (to) => ({ slug: to.params.slug, root: false, fallbackTitle: BUILT_IN_PAGES[to.params.slug] ?? '' }),
      meta: { title: '' },
    },
    { path: '/settings', component: SiteSettings, meta: { title: '網站設定' } },
    // 登入是頁首開啟的視窗；舊的 /login 連結回到原本的頁面並開啟視窗
    { path: '/login', redirect: (to) => ({ path: safeRedirect(to.query.redirect), query: { login: '1' } }) },
    // 放在第一層的頁面，例如 /about、/test；上面的網站功能優先
    {
      // vue-router 的參數規則不能有括號；網址格式由資料庫的 pages_slug_check 檢查
      path: '/:slug([a-z0-9][a-z0-9-]*)',
      sensitive: true, // 頁面網址只有小寫，/Test 不是頁面
      component: PageView,
      props: (to) => ({ slug: to.params.slug, root: true, fallbackTitle: BUILT_IN_PAGES[to.params.slug] ?? '' }),
      meta: { title: '' },
    },
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
