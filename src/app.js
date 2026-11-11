import { createServer } from 'node:http';
import { openDb } from './db/index.js';
import { createGraphQLHandler } from './graphql/index.js';
import { createFileHandler, fileFromPath } from './http/files.js';
import { createRequestGuard } from './http/request-guard.js';
import { createSiteDataHandler, SITE_DATA_PATH } from './http/site-data.js';
import { createStaticHandler } from './http/static.js';
import { createStaticSiteHandler, STATIC_SITE_PATH } from './http/static-site.js';
import { createSessions } from './lib/sessions.js';
import { createStorage } from './lib/storage.js';

export async function createApp({ databaseUrl, dataDir, publicDir = null, production = false, allowedOrigins = [] }) {
  const db = await openDb(databaseUrl);
  const storage = createStorage({ db, dataDir });
  const sessions = createSessions({ db, production });

  const graphql = createGraphQLHandler({ db, storage, sessions, production, allowedOrigins });
  const serveFile = createFileHandler({ db, storage });
  const checkRequest = createRequestGuard({ sessions, allowedOrigins });
  const siteData = createSiteDataHandler({ db, storage, sessions, allowedOrigins });
  const staticSite = createStaticSiteHandler({ db, storage, sessions, publicDir });
  const serveStatic = publicDir && createStaticHandler(publicDir);

  async function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    // 輸出與匯入的檔案很大，自己檢查權限與來源，不經過一般請求的大小限制
    if (pathname === SITE_DATA_PATH) return siteData(req, res);
    if (pathname === STATIC_SITE_PATH) return staticSite(req, res);
    if (req.method === 'GET' || req.method === 'HEAD') {
      const file = fileFromPath(pathname);
      if (file) return serveFile(res, file);
      if (serveStatic && await serveStatic(res, pathname)) return undefined;
    }
    if (await checkRequest(req, res)) return graphql(req, res);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      res.destroy();
    });
  });

  // 照片不限大小，預設的 5 分鐘不夠上傳大檔
  server.requestTimeout = 60 * 60 * 1000;

  return { server, db };
}
