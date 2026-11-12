import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline, Readable } from 'node:stream';
import { pipeline as pipelineAsync } from 'node:stream/promises';
import { GraphQLError } from 'graphql';
import { SITE_DATA_PERMISSIONS } from '../lib/permissions.js';
import { createZip } from '../lib/zip.js';
import { exportSiteFiles } from '../site-files/export.js';
import { importSite } from '../site-files/import.js';
import { zipSource } from '../site-files/sources.js';
import { authorize } from './authorize.js';
import { isAllowedOrigin } from './request-guard.js';

/** GET 下載網站資料（ZIP，資料夾結構見 README），POST 上傳同樣格式的 ZIP 取代所有網站資料 */
export const SITE_DATA_PATH = '/site-data';

export function reply(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

/** 台灣時區的日期，例如 2026-11-11 */
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());

/** 資料庫拒絕的值：已有中文說明的直接使用，其他的附上原文 */
function importErrorMessage(error) {
  if (error instanceof GraphQLError) return [400, error.message];
  if (/^2[23]/.test(error.code ?? '')) return [400, `網站資料的內容不正確：${error.message}`];
  console.error(error);
  return [500, '匯入時發生錯誤，網站資料沒有改變'];
}

export function createSiteDataHandler({ db, storage, sessions, allowedOrigins, onContentChange = () => {} }) {
  let importing = false;

  async function exportSite(res) {
    const zip = await createZip(await exportSiteFiles({ db, storage }));
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': zip.length,
      'Content-Disposition': `attachment; filename="site-data-${today()}.zip"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    // 用 pipeline 才會在下載中斷時關閉檔案
    pipeline(Readable.from(zip.stream()), res, (error) => {
      if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(error);
    });
  }

  /** 上傳的 ZIP 先存成暫存檔：ZIP 的目錄在檔案結尾，要整個收到才能讀 */
  async function importUpload(req) {
    const temp = storage.pathOf(`.import-${randomUUID()}.zip`);
    try {
      await pipelineAsync(req, createWriteStream(temp));
      const source = await zipSource(temp);
      try {
        return await importSite({ db, storage, source });
      } finally {
        await source.close();
      }
    } finally {
      await rm(temp, { force: true });
    }
  }

  return async function handleSiteData(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
    // 匯入會取代所有內容，和 GraphQL 一樣檢查來源
    if (req.method === 'POST' && !isAllowedOrigin(req.headers.origin, req.headers.host, allowedOrigins)) {
      return reply(res, 403, 'Forbidden origin');
    }
    const allowed = await authorize({
      sessions, req, res, reply, permissions: SITE_DATA_PERMISSIONS, message: '輸出與匯入網站資料需要所有內容的管理權限（帳號管理除外）',
    });
    if (!allowed) return undefined;
    if (req.method === 'GET') return exportSite(res);

    if (importing) return reply(res, 409, '已經有人正在匯入網站資料，請稍後再試', { Connection: 'close' });
    importing = true;
    try {
      reply(res, 200, await importUpload(req));
      onContentChange();
    } catch (error) {
      reply(res, ...importErrorMessage(error), { Connection: 'close' });
    } finally {
      importing = false;
    }
    return undefined;
  };
}
