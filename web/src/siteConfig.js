import { computed, ref, watch, watchEffect } from 'vue';
import { contentVersion, fetchSiteConfig } from './api.js';
import { cache } from './cache.js';

const CACHE_KEY = 'site-config';

/** 圖片欄位是 null 時使用的內建圖片（web/public） */
export const DEFAULT_IMAGES = {
  faviconUrl: '/favicon.png',
  logoUrl: '/logo.webp',
  campusUrl: '/campus.jpg',
};

/** 全站設定，所有元件共用一份；載入前是 null。先顯示本地快取，再到背景更新 */
export const siteConfig = ref(cache.read(CACHE_KEY)?.data ?? null);

async function load() {
  try {
    siteConfig.value = await fetchSiteConfig();
    cache.write(CACHE_KEY, siteConfig.value);
  } catch (error) {
    console.error(error);
  }
}

load();
watch(contentVersion, load);

/** 設定的圖片網址，沒有設定時用內建的圖片 */
export const siteImage = (field) => computed(() => siteConfig.value?.[field] ?? DEFAULT_IMAGES[field]);

// 分頁標題：「頁面名稱｜網站標題」。設定載入前沿用 index.html 的標題
const fallbackTitle = document.title;
const pageName = ref('');

export function setTitle(name) {
  pageName.value = name ?? '';
}

watchEffect(() => {
  const site = siteConfig.value?.siteTitle ?? fallbackTitle;
  document.title = pageName.value ? `${pageName.value}｜${site}` : site;
});

const favicon = siteImage('faviconUrl');
watchEffect(() => {
  document.querySelector('link[rel="icon"]')?.setAttribute('href', favicon.value);
});
