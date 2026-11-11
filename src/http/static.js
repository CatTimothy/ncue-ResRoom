import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { headTags, originOf } from './seo.js';

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

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** 不是公開頁面（例如 /settings）時，沒有 JavaScript 的訪客看到的說明 */
const NEEDS_SCRIPT = '<div class="page"><p>這個頁面需要開啟 JavaScript 才能使用。<a href="/">回到首頁</a></p></div>';

/**
 * 提供 web 建置出來的網站。回傳 false 表示這個請求不歸它處理。
 * noscript（src/http/noscript.js）提供時，前端路由的 index.html 會加上沒有 JavaScript 時看到的內容
 */
export function createStaticHandler(publicDir, { noscript = null, siteUrl = null } = {}) {
  const root = resolve(publicDir);

  /** 前端路由的網址都回傳 index.html；有對應的公開頁面時，放進 <noscript>，並換上這一頁的標題 */
  async function sendApp(req, res, pathname) {
    let html = await readFile(join(root, 'index.html'), 'utf8').catch(() => null);
    if (html === null) return false;
    const rendered = noscript && await noscript.get(pathname).catch((error) => {
      console.error(error); // 產生失敗不影響有 JavaScript 的訪客
      return null;
    });
    if (rendered) {
      const { page, site, theme } = rendered;
      // 搜尋引擎與分享用的資訊：取代 index.html 原本通用的描述
      const tags = headTags(page, site, originOf(req, siteUrl));
      html = /<meta name="description"[^>]*>/.test(html)
        ? html.replace(/<meta name="description"[^>]*>/, () => tags)
        : html.replace('</head>', () => `${tags}</head>`);
      // 開啟 JavaScript 時 <noscript> 的內容是純文字，裡面不能出現 </noscript>；取代用函式，內容裡的 $& 等字不會被當成特殊符號
      const body = (page?.body ?? NEEDS_SCRIPT).replace(/<\/noscript/gi, '&lt;/noscript');
      // 沒有 JavaScript 時套不了主題，用網站設定的淺色主題顏色
      const colors = Object.entries(theme.colors).map(([name, color]) => `--${name}: ${color};`).join(' ');
      html = html
        .replace('<div id="app"></div>', () => `<noscript>${body}</noscript><div id="app"></div>`)
        .replace('</head>', () => (colors ? `<noscript><style>:root { ${colors} }</style></noscript></head>` : '</head>'));
      if (page) html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(page.title)}</title>`);
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(html);
    return true;
  }

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

  return async function serveStatic(req, res, pathname) {
    if (pathname === '/graphql' || pathname.startsWith('/files/')) return false;

    const decoded = decode(pathname);
    if (decoded === null) return false;
    const path = resolve(join(root, decoded));
    if (path === root || !path.startsWith(root + sep)) {
      return path === root && sendApp(req, res, '/');
    }

    // assets 的檔名含內容雜湊，內容改變時檔名也會變，可以長期快取
    const cacheControl = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (await send(res, path, cacheControl)) return true;

    // 沒有副檔名的是前端路由，例如重新整理 /photos；有副檔名的就是真的找不到
    return !extname(pathname) && sendApp(req, res, pathname.replace(/(.)\/+$/, '$1'));
  };
}
