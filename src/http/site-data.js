import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { parse } from 'node:path';
import { Readable, pipeline } from 'node:stream';
import { GraphQLError } from 'graphql';
import { fail } from '../lib/errors.js';
import { hasPermission } from '../lib/guards.js';
import { SITE_DATA_PERMISSIONS } from '../lib/permissions.js';
import { readTar, TAR_END, tarHeader, tarPadding } from '../lib/tar.js';
import { isAllowedOrigin } from './request-guard.js';

/** GET 下載網站資料，POST 上傳同樣格式的檔案取代所有網站資料 */
export const SITE_DATA_PATH = '/site-data';

// 封存檔內容：data.json（資料庫的 export_site() 加上下面的標記），以及 files/ 底下的照片與文件原始檔。
// 壓縮版圖片可以重新產生，不包含在內。修改 data.json 的格式時要遞增版本，並讓匯入能讀舊版
const FORMAT = 'ncue-resroom-site-data';
const VERSION = 1;
const DATA_ENTRY = 'data.json';
const MAX_DATA_SIZE = 200 * 1024 * 1024;
const STORED_NAME = /^[0-9a-f-]{36}\.[a-z0-9]+$/; // 和 src/http/files.js 的網址格式一致
const FILE_ENTRY = /^files\/([0-9a-f-]{36}\.[a-z0-9]+)$/;
const FILE_TABLES = ['photos', 'documents'];

function reply(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

/** 台灣時區的日期，例如 2026-11-11 */
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());

const storedNamesOf = (tables) => FILE_TABLES.flatMap((table) => (tables[table] ?? []).map((row) => row.stored_name));

/** 寫入檔案的 sink（見 readTar） */
async function fileSink(path) {
  const handle = await open(path, 'wx');
  return {
    async write(chunk) {
      for (let offset = 0; offset < chunk.length;) {
        offset += (await handle.write(chunk, offset)).bytesWritten;
      }
    },
    close: () => handle.close(),
  };
}

/** 收集到記憶體的 sink */
function memorySink() {
  const chunks = [];
  return {
    write: (chunk) => { chunks.push(Buffer.from(chunk)); },
    close: () => {},
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

function checkData(data) {
  if (data?.format !== FORMAT || typeof data.tables !== 'object' || data.tables === null) {
    fail('這不是本網站輸出的網站資料');
  }
  if (!Number.isInteger(data.version) || data.version > VERSION) fail('這份網站資料來自較新版本的網站，請先更新網站再匯入');
  for (const table of FILE_TABLES) {
    const rows = data.tables[table] ?? [];
    // 檔名會用來組成檔案路徑，不能讓資料指到上傳資料夾以外的地方
    if (!Array.isArray(rows) || !rows.every((row) => STORED_NAME.test(row?.stored_name))) fail('網站資料裡有不正確的檔名');
  }
}

/** 資料庫拒絕的值：已有中文說明的直接使用，其他的附上原文 */
function importErrorMessage(error) {
  if (error instanceof GraphQLError) return [400, error.message];
  if (/^2[23]/.test(error.code ?? '')) return [400, `網站資料的內容不正確：${error.message}`];
  console.error(error);
  return [500, '匯入時發生錯誤，網站資料沒有改變'];
}

export function createSiteDataHandler({ db, storage, sessions, allowedOrigins }) {
  let importing = false;

  const storedNamesInDb = async () => (
    await db.prepare('SELECT stored_name FROM photos UNION ALL SELECT stored_name FROM documents').all()
  ).map((row) => row.storedName);

  /** 檢查權限；不通過時直接回應並回傳 false */
  async function authorize(req, res) {
    const context = await sessions.current(req.headers.cookie);
    const rejected = !context.user ? [401, '請先登入']
      : !SITE_DATA_PERMISSIONS.every((permission) => hasPermission(context, permission))
        ? [403, '輸出與匯入網站資料需要所有內容的管理權限（帳號管理除外）']
        : null;
    if (rejected) reply(res, ...rejected);
    return !rejected;
  }

  async function exportSite(res) {
    const { tables } = await db.prepare('SELECT export_site() AS tables').get();
    const data = Buffer.from(JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), tables }));

    // 檔案不見的資料列（例如只還原了資料庫）照樣輸出，和原本的網站一樣
    const files = (await Promise.all(storedNamesOf(tables).map(async (name) => {
      const info = await stat(storage.pathOf(name)).catch(() => null);
      return info?.isFile() ? { name, size: info.size, mtime: info.mtimeMs } : null;
    }))).filter(Boolean);

    const entries = [{ name: DATA_ENTRY, size: data.length }, ...files];
    const length = entries.reduce((sum, { size }) => sum + 512 + size + tarPadding(size).length, TAR_END.length);

    async function* archive() {
      yield tarHeader(DATA_ENTRY, data.length);
      yield data;
      yield tarPadding(data.length);
      for (const file of files) {
        yield tarHeader(`files/${file.name}`, file.size, file.mtime);
        yield* createReadStream(storage.pathOf(file.name));
        yield tarPadding(file.size);
      }
      yield TAR_END;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-tar',
      'Content-Length': length,
      'Content-Disposition': `attachment; filename="resroom-${today()}.tar"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    // 用 pipeline 才會在下載中斷時關閉檔案
    pipeline(Readable.from(archive()), res, (error) => {
      if (error && error.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.error(error);
    });
  }

  /** 先把上傳的檔案寫進暫存檔，讀完並檢查過資料才換掉網站資料 */
  async function importSite(req) {
    const staged = new Map(); // 檔名 → 暫存檔
    let data = null;
    try {
      let dataSink = null;
      await readTar(req, (name, size) => {
        if (name === DATA_ENTRY) {
          if (dataSink) fail('檔案裡有多份網站資料');
          if (size > MAX_DATA_SIZE) fail('網站資料太大');
          dataSink = memorySink();
          return dataSink;
        }
        const storedName = FILE_ENTRY.exec(name)?.[1];
        if (!storedName || staged.has(storedName)) return null;
        const temp = storage.pathOf(`.import-${randomUUID()}.tmp`);
        staged.set(storedName, temp);
        return fileSink(temp);
      });
      if (!dataSink) fail('這不是本網站輸出的網站資料');
      try {
        data = JSON.parse(dataSink.text());
      } catch {
        fail('網站資料已損毀');
      }
      checkData(data);

      const names = new Set(storedNamesOf(data.tables));
      const previous = await storedNamesInDb();
      const existing = new Set(previous);

      // 同一個網站匯入自己的資料時檔名相同，內容也相同，直接覆蓋
      const added = [];
      for (const [name, temp] of staged) {
        if (!names.has(name)) continue;
        await rename(temp, storage.pathOf(name));
        staged.delete(name);
        if (!existing.has(name)) added.push(name);
      }

      try {
        await db.prepare('SELECT import_site($1::jsonb)').run(JSON.stringify(data.tables));
      } catch (error) {
        await storage.removeFiles(added);
        throw error;
      }
      await storage.removeFiles(previous.filter((name) => !names.has(name)));

      const found = await Promise.all([...names].map((name) => stat(storage.pathOf(name)).then(() => true, () => false)));
      return {
        counts: Object.fromEntries(['pages', 'announcements', 'albums', 'photos', 'documents'].map(
          (table) => [table, data.tables[table]?.length ?? 0],
        )),
        missingFiles: found.filter((ok) => !ok).length,
      };
    } finally {
      await Promise.all([...staged.values()].map((temp) => rm(temp, { force: true })));
    }
  }

  /** 匯入後在背景產生壓縮版，第一次瀏覽時不用等；失敗時瀏覽時會再產生一次 */
  async function createDisplays() {
    const photos = await db.prepare('SELECT stored_name FROM photos ORDER BY id DESC').all();
    for (const { storedName: name } of photos) {
      const exists = await stat(storage.displayPath(parse(name).name)).catch(() => null);
      if (!exists) await storage.createDisplay(name).catch((error) => console.error(error));
    }
  }

  return async function handleSiteData(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
    // 匯入會取代所有內容，和 GraphQL 一樣檢查來源
    if (req.method === 'POST' && !isAllowedOrigin(req.headers.origin, req.headers.host, allowedOrigins)) {
      return reply(res, 403, 'Forbidden origin');
    }
    if (!(await authorize(req, res))) return undefined;
    if (req.method === 'GET') return exportSite(res);

    if (importing) return reply(res, 409, '已經有人正在匯入網站資料，請稍後再試', { Connection: 'close' });
    importing = true;
    try {
      const result = await importSite(req);
      reply(res, 200, result);
      createDisplays().catch((error) => console.error(error));
    } catch (error) {
      // 可能還沒讀完上傳的內容，回應後關閉連線
      reply(res, ...importErrorMessage(error), { Connection: 'close' });
    } finally {
      importing = false;
    }
    return undefined;
  };
}
