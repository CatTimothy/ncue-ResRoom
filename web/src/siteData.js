// 網站資料的 ZIP（src/site-files）。匯入前先在瀏覽器讀出內容摘要，讓管理員確認
import { EXTENSION_METAS } from './extensions/meta.js';
import { readZipIndex, siteFilePaths, siteSummary } from './zipIndex.js';

/** 輸出與匯入網站資料的網址 */
export const SITE_DATA_URL = '/site-data';

/** 和 src/lib/permissions.js 的 SITE_DATA_PERMISSIONS 一致：系統擴充功能的權限，加上頁面與網站設定 */
export const SITE_DATA_PERMISSIONS = [
  ...EXTENSION_METAS.filter((meta) => meta.system).flatMap((meta) => Object.keys(meta.permissions ?? {})),
  'MANAGE_PAGES',
  'MANAGE_SITE_CONFIG',
];

const ITEMS = [
  ['pages', '頁面', '個'],
  ['announcements', '公告', '則'],
  ['albums', '相簿', '本'],
  ['photos', '相簿照片', '張'],
  ['documents', '文件', '份'],
];

/** 讀出 ZIP 的檔案清單，回傳各類內容的數量；不是網站資料時丟出錯誤 */
export async function readSiteData(file) {
  const readAt = async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());
  const entries = await readZipIndex(file.size, readAt);
  return siteSummary(siteFilePaths(entries.map((entry) => entry.name)).keys());
}

/** 例如「3 個頁面、12 則公告、沒有相簿…」 */
export const countsText = (counts) => ITEMS
  .map(([key, label, unit]) => (counts[key] ? `${counts[key]} ${unit}${label}` : `沒有${label}`))
  .join('、');

/** 匯入前的確認文字 */
export const importQuestion = (counts) => `這份網站資料包含${countsText(counts)}，以及網站設定與頁首選單。\n\n`
  + '匯入後，目前網站的這些內容會全部被取代，無法復原（帳號不受影響）。建議先輸出目前的網站資料留存。\n\n確定要匯入嗎？';
