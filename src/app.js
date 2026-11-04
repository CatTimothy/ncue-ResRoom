import { createServer } from 'node:http';
import { openDb } from './db/index.js';
import { createGraphQLHandler } from './graphql/index.js';
import { createFileHandler, fileFromPath } from './http/files.js';
import { createRequestGuard } from './http/request-guard.js';
import { createStaticHandler } from './http/static.js';
import { createSessions } from './lib/sessions.js';
import { createStorage } from './lib/storage.js';

export async function createApp({ databaseUrl, dataDir, publicDir = null, production = false, allowedOrigins = [] }) {
  const db = await openDb(databaseUrl);
  const storage = createStorage({ db, dataDir });
  const sessions = createSessions({ db, production });

  const graphql = createGraphQLHandler({ db, storage, sessions, production, allowedOrigins });
  const serveFile = createFileHandler({ db, storage });
  const checkRequest = createRequestGuard({ sessions, allowedOrigins });
  const serveStatic = publicDir && createStaticHandler(publicDir);

  async function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
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
