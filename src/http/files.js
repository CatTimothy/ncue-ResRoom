import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import { respond } from './respond.js';

/** 從網址路徑判斷要提供的檔案；不是檔案路徑時回傳 null */
export function fileFromPath(pathname) {
  const display = /^\/files\/display\/([0-9a-f-]{36})\.webp$/.exec(pathname);
  if (display) return { displayId: display[1] };
  const original = /^\/files\/([0-9a-f-]{36}\.[a-z0-9]+)$/.exec(pathname);
  return original && { storedName: original[1] };
}

export function createFileHandler({ db, storage }) {
  async function send(res, path, headers) {
    const info = await stat(path).catch(() => null);
    if (!info) return respond(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Length': info.size,
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    });
    // 用 pipeline 才會在連線中斷時關閉檔案；否則檔案會一直被佔用，在 Windows 上無法刪除
    pipeline(createReadStream(path), res, () => {});
  }

  /** 壓縮版不見時（例如只還原了原始檔的備份）重新產生；不屬於任何圖片時不處理 */
  async function regenerateDisplay(id) {
    const image = await db.prepare(`
      SELECT stored_name FROM photos WHERE stored_name LIKE $1 || '.%'
    `).get(id);
    if (image) await storage.createDisplay(image.storedName).catch((error) => console.error(error));
  }

  /** 網頁顯示用的壓縮版。只為了瀏覽順暢才快取，刪除後最多再留 1 小時 */
  async function serveDisplay(res, id) {
    const path = storage.displayPath(id);
    if (!(await stat(path).catch(() => null))) await regenerateDisplay(id);
    return send(res, path, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=3600' });
  }

  /** 原始檔一律下載，不留在瀏覽器快取佔空間 */
  async function serveOriginal(res, storedName) {
    const row = await db.prepare(`
      SELECT COALESCE(filename, stored_name) AS filename FROM photos WHERE stored_name = $1
      UNION ALL
      SELECT filename FROM documents WHERE stored_name = $1
    `).get(storedName);
    if (!row) return respond(res, 404, 'Not found');
    return send(res, storage.pathOf(storedName), {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    });
  }

  return function serveFile(res, { displayId, storedName }) {
    return displayId ? serveDisplay(res, displayId) : serveOriginal(res, storedName);
  };
}
