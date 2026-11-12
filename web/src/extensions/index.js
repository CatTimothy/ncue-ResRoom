// 自動產生，請勿手動修改：新增或移除擴充功能的資料夾後執行 npm run extensions:sync。說明見 docs/extensions.md
// 擴充功能的網站部分：各資料夾 index.js 的 routes、home。停用的擴充功能，網址顯示找不到頁面，選單與首頁也不顯示
import announcements from './announcements/index.js';
import documents from './documents/index.js';
import photos from './photos/index.js';

export const EXTENSIONS = [announcements, photos, documents];

/** 所有擴充功能的路由；meta.extension 記錄屬於哪個擴充功能，標題預設是 label */
export const extensionRoutes = () => EXTENSIONS.flatMap(({ key, label, routes }) => routes.map((route) => ({
  ...route,
  meta: { title: label, ...route.meta, extension: key },
})));
