// 擴充功能的啟用狀態（資料庫的 extensions 資料表）。清單在 ./index.js（自動產生）
import { EXTENSIONS } from './index.js';

/** 啟用中的擴充功能的 key。extensions 資料表沒有記錄的視為啟用 */
export async function enabledExtensionKeys(db) {
  const disabled = new Set((await db.prepare('SELECT key FROM extensions WHERE NOT enabled').all()).map((row) => row.key));
  return new Set(EXTENSIONS.map(({ key }) => key).filter((key) => !disabled.has(key)));
}

export async function isExtensionEnabled(db, key) {
  const row = await db.prepare('SELECT enabled FROM extensions WHERE key = $1').get(key);
  return row?.enabled ?? true;
}

/** 啟用中的擴充功能物件，依順序 */
export async function enabledExtensions(db) {
  const keys = await enabledExtensionKeys(db);
  return EXTENSIONS.filter(({ key }) => keys.has(key));
}
