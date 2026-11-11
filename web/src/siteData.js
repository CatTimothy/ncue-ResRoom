// 網站資料的檔案（src/http/site-data.js 輸出的 tar）。匯入前先在瀏覽器讀出內容摘要，讓管理員確認
import { rocDateTimeText } from './format.js';

/** 輸出與匯入網站資料的網址 */
export const SITE_DATA_URL = '/site-data';

/** 和 src/lib/permissions.js 的 SITE_DATA_PERMISSIONS 一致：帳號管理以外的所有權限 */
export const SITE_DATA_PERMISSIONS = ['MANAGE_ANNOUNCEMENTS', 'MANAGE_ALBUMS', 'MANAGE_DOCUMENTS', 'MANAGE_PAGES', 'MANAGE_SITE_CONFIG'];

const FORMAT = 'ncue-resroom-site-data';
const NOT_SITE_DATA = '這不是本網站輸出的網站資料檔案。';

const ITEMS = [
  ['pages', '頁面', '個'],
  ['announcements', '公告', '則'],
  ['albums', '相簿', '本'],
  ['photos', '照片與內文圖片', '張'],
  ['documents', '文件', '份'],
];

/** 讀出檔案開頭的 data.json，回傳 { exportedAt, counts }；不是網站資料時丟出錯誤 */
export async function readSiteData(file) {
  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const field = (start, length) => new TextDecoder().decode(header.subarray(start, start + length)).replace(/\0[\s\S]*$/, '');
  const size = Number.parseInt(field(124, 12).trim(), 8);
  if (header.length < 512 || field(0, 100) !== 'data.json' || !Number.isSafeInteger(size)) throw new Error(NOT_SITE_DATA);

  let data;
  try {
    data = JSON.parse(await file.slice(512, 512 + size).text());
  } catch {
    throw new Error('網站資料已損毀，無法讀取。');
  }
  if (data?.format !== FORMAT || typeof data.tables !== 'object') throw new Error(NOT_SITE_DATA);
  return {
    exportedAt: data.exportedAt ?? null,
    counts: Object.fromEntries(ITEMS.map(([table]) => [table, data.tables?.[table]?.length ?? 0])),
  };
}

/** 例如「3 個頁面、12 則公告、沒有相簿…」 */
export const countsText = (counts) => ITEMS
  .map(([table, label, unit]) => (counts[table] ? `${counts[table]} ${unit}${label}` : `沒有${label}`))
  .join('、');

/** 匯入前的確認文字 */
export function importQuestion({ exportedAt, counts }) {
  const when = exportedAt ? `這份網站資料輸出於 ${rocDateTimeText(exportedAt)}，` : '這份網站資料';
  return `${when}包含${countsText(counts)}，以及網站設定與頁首選單。\n\n`
    + '匯入後，目前網站的這些內容會全部被取代，無法復原（帳號不受影響）。建議先輸出目前的網站資料留存。\n\n確定要匯入嗎？';
}
