import { computed, watchEffect } from 'vue';
import { fetchPages, fetchSiteConfig } from './api.js';
import { pageName } from './page.js';
import { useCachedItem } from './useCachedItem.js';

/** 圖片欄位是 null 時使用的內建圖片（web/public） */
export const DEFAULT_IMAGES = {
  faviconUrl: '/favicon.png',
  logoUrl: '/logo.webp',
  campusUrl: '/campus.jpg',
};

/** 全站設定，所有元件共用一份；載入前是 null */
export const { item: siteConfig } = useCachedItem(() => 'site-config', fetchSiteConfig);

/** 所有頁面的 slug 與標題，頁首選單與網站設定共用一份 */
export const { item: pages } = useCachedItem(() => 'pages', fetchPages);

/** 設定的圖片網址，沒有設定時用內建的圖片 */
export const siteImage = (field) => computed(() => siteConfig.value?.[field] ?? DEFAULT_IMAGES[field]);

// 設定載入前沿用 index.html 的標題
const fallbackTitle = document.title;
watchEffect(() => {
  const site = siteConfig.value?.siteTitle ?? fallbackTitle;
  document.title = pageName.value ? `${pageName.value}｜${site}` : site;
});

const favicon = siteImage('faviconUrl');
watchEffect(() => {
  document.querySelector('link[rel="icon"]')?.setAttribute('href', favicon.value);
});
