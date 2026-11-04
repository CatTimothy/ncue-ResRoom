import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function decode(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/** 提供 web 建置出來的網站。回傳 false 表示這個請求不歸它處理 */
export function createStaticHandler(publicDir) {
  const root = resolve(publicDir);

  async function send(res, path, cacheControl) {
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return false;
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    });
    pipeline(createReadStream(path), res, () => {});
    return true;
  }

  return async function serveStatic(res, pathname) {
    if (pathname === '/graphql' || pathname.startsWith('/files/')) return false;

    const decoded = decode(pathname);
    if (decoded === null) return false;
    const path = resolve(join(root, decoded));
    if (path === root || !path.startsWith(root + sep)) {
      return path === root && send(res, join(root, 'index.html'), 'no-cache');
    }

    // assets 的檔名含內容雜湊，內容改變時檔名也會變，可以長期快取
    const cacheControl = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (await send(res, path, cacheControl)) return true;

    // 沒有副檔名的是前端路由，例如重新整理 /photos；有副檔名的就是真的找不到
    return !extname(pathname) && send(res, join(root, 'index.html'), 'no-cache');
  };
}
