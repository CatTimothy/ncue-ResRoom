import { computed, watchEffect } from 'vue';
import { fetchExtensions, fetchNavigation, fetchSiteConfig } from './api.js';
import { DEFAULT_IMAGES } from './defaultImages.js';
import { pageName } from './page.js';
import { useCachedItem } from './useCachedItem.js';

export { DEFAULT_IMAGES };

/** 全站設定，所有元件共用一份；載入前是 null */
export const { item: siteConfig } = useCachedItem(() => 'site-config', fetchSiteConfig);

/** 頁首選單 { utility: [{ service, page }], main }，頁首與網站設定共用一份；載入前是 null */
export const { item: navigation } = useCachedItem(() => 'navigation', fetchNavigation);

/** 擴充功能與啟用狀態 [{ key, label, description, path, system, enabled }]；載入前是 null */
export const { item: extensionStates } = useCachedItem(() => 'extensions', fetchExtensions);

/** 擴充功能是否啟用；狀態載入前當作啟用，避免網址先顯示找不到頁面 */
export const isExtensionEnabled = (key) => extensionStates.value?.find((extension) => extension.key === key)?.enabled ?? true;

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
