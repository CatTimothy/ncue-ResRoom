// 把網站輸出成靜態的 HTML 檔（網站設定的「下載靜態網站」）。
// 版面和 web/ 的 Vue 元件一致（共用 style.css 與 web/src 的格式函式），但只有公開內容：首頁、頁面與啟用中的擴充功能的頁面（各自的 static.js）。
// 每個網址是一個資料夾裡的 index.html，連結都是相對路徑，放到任何網頁伺服器或直接開啟檔案都能瀏覽。
// 修改 web/ 的版面時，這裡的對應樣板也要一起改
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IMAGES } from '../../web/src/defaultImages.js';
import { telHref } from '../../web/src/format.js';
import { mapMenus, menuLink, pagePath } from '../../web/src/navigation.js';
import { enabledExtensions } from '../extensions/state.js';
import { readNavigation } from '../graphql/navigation.js';
import { renderPage } from '../lib/content.js';
import { fail } from '../lib/errors.js';
import {
  articleBody, excerpt, firstImage, HOME_CRUMB, html, latest, page, raw, textOf, urlsFor,
} from './template.js';

export { textOf };

const COPYRIGHT = 'CatTimothy'; // 和 web/src/components/SiteFooter.vue 一致
const GITHUB_URL = 'https://github.com/CatTimothy/ncue-ResRoom';
const NAV_LABELS = { utility: '輔助選單', main: '主選單' };

const isCurrent = (u, to) => u.route === to || (to !== '/' && u.route.startsWith(`${to}/`));

// ---- 共用的區塊，對應 App.vue、SiteFooter.vue 等元件 ----
function header(site, u) {
  const menus = mapMenus(site.navigation, menuLink);
  return html`
  <a class="skip-link" href="#main">跳到主要內容</a>
  <div class="path" aria-hidden="true"><div class="path__fill"></div></div>
  <header class="site-header">
    <a href="${u.to('/')}" class="wordmark" aria-label="${site.config.siteTitle}首頁">
      <img src="${u.local(site.images.logoUrl)}" width="776" height="140" alt="" />
      ${site.config.logoText && html`<span class="wordmark__unit">${site.config.logoText}</span>`}
    </a>
    <div class="site-header__tools">
      ${u.mode === 'files' && html`<button type="button" class="icon-button" aria-label="深色模式" aria-pressed="false" data-theme-toggle>
        <svg class="icon" data-icon="sun" viewBox="0 0 24 24" aria-hidden="true" hidden>
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
        <svg class="icon" data-icon="moon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      </button>`}
    </div>
    <div class="site-header__nav">
      ${u.mode === 'files' && html`<button type="button" class="menu-toggle" aria-label="選單" aria-controls="site-menus" aria-expanded="false">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <span class="menu-toggle__label">選單</span>
      </button>`}
      <div id="site-menus" class="site-header__menus${u.mode === 'site' ? ' site-header__menus--static' : ''}">
        ${Object.entries(NAV_LABELS).map(([row, label]) => menus[row].length > 0 && html`
        <nav class="${row}-nav" aria-label="${label}">
          ${menus[row].map((link) => html`<a href="${u.to(link.to)}"${isCurrent(u, link.to) ? raw(' class="is-current" aria-current="page"') : ''}>${link.label}</a>`)}
        </nav>`)}
      </div>
    </div>
  </header>`;
}

function footer({ config }, year) {
  return html`
  <footer class="site-footer">
    <div class="site-footer__head"><h2 class="site-footer__title">${config.footerTitle}</h2></div>
    <p class="site-footer__phone">
      <a href="${telHref(config.phone)}">${config.phone}</a>
      ${config.extension && html`<span>${config.extension}</span>`}
    </p>
    ${(config.hours || config.teachers.length > 0) && html`
    <dl>
      ${config.hours && html`<div><dt>開放時間</dt><dd>${config.hours}</dd></div>`}
      ${config.teachers.length > 0 && html`<div><dt>聯絡老師</dt><dd>${config.teachers.map(({ name, email, extension }, index) => html`${index > 0 && raw('<br />')}${name} <a href="mailto:${email}">${email}</a>${extension && html`<span> 分機 ${extension}</span>`}`)}</dd></div>`}
    </dl>`}
    <div class="site-footer__bottom">
      <small>Copyright © ${year} ${COPYRIGHT}</small>
      <a class="site-footer__github" href="${GITHUB_URL}" target="_blank" rel="noopener" aria-label="GitHub 原始碼"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>GitHub</a>
    </div>
  </footer>`;
}

const LIGHTBOX = raw(`
  <dialog class="lightbox" aria-label="檢視照片">
    <img class="lightbox__image" alt="" />
    <div class="lightbox__bar">
      <div class="lightbox__caption" aria-live="polite"><span class="lightbox__text"></span><span class="lightbox__count"></span></div>
      <div class="lightbox__actions">
        <button type="button" class="button" data-step="-1">上一張</button>
        <button type="button" class="button" data-step="1">下一張</button>
        <a class="button" download>下載照片</a>
        <button type="button" class="button" data-close>關閉</button>
      </div>
    </div>
  </dialog>`);

/** 開頁時先套用主題，避免閃一下另一個主題；和 index.html、theme.js 的規則一樣，訪客的選擇優先 */
function themeScript({ config }) {
  const settings = JSON.stringify({ preset: config.defaultTheme, light: config.lightTheme, dark: config.darkTheme }).replace(/</g, '\\u003c');
  return raw(`<script>
      (() => {
        const settings = ${settings};
        const root = document.documentElement;
        window.applySiteTheme = (mode) => {
          root.dataset.theme = mode;
          for (const name of ['background', 'surface', 'text', 'primary', 'accent']) {
            const color = settings[mode][name];
            if (color) root.style.setProperty('--' + name, color);
            else root.style.removeProperty('--' + name);
          }
        };
        let choice = null;
        try { choice = localStorage.getItem('resroom-theme'); } catch {}
        const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        window.applySiteTheme(choice === 'light' || choice === 'dark' ? choice : settings.preset === 'SYSTEM' ? system : settings.preset.toLowerCase());
      })();
    </script>`);
}


const fullTitleOf = (site, title) => (title ? `${title}｜${site.config.siteTitle}` : site.config.siteTitle);

function layout(site, { route, title, body, lightbox, meta }) {
  const u = urlsFor(route);
  const fullTitle = fullTitleOf(site, title);
  return html`<!doctype html>
<html lang="zh-Hant-TW">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${meta?.description ?? siteDescription(site)}" />
    <link rel="icon" href="${u.local(site.images.faviconUrl)}" />
    ${site.styles.map((path) => html`<link rel="stylesheet" href="${u.local(`/${path}`)}" />`)}
    <title>${fullTitle}</title>
    ${themeScript(site)}
  </head>
  <body>
    ${header(site, u)}
    <main id="main" tabindex="-1">
      ${body(u)}
    </main>
    ${footer(site, site.year)}
    ${lightbox && LIGHTBOX}
    <script src="${u.local('/site.js')}"></script>
  </body>
</html>
`.value;
}

// ---- 各頁的內容，對應 web/src/views；擴充功能的頁面在 src/extensions/<名稱>/static.js ----
const DOTS = Array.from({ length: 9 * 7 }, (_, i) => Math.round(Math.hypot(i % 9, 6 - Math.floor(i / 9))));

/** 首頁：主視覺，加上各擴充功能的首頁區塊 */
function homePage(site) {
  const { config, images } = site;
  const sections = site.extensions.filter(({ staticSite }) => staticSite.home);
  return page('/', '', (u) => html`
    <section class="hero" aria-labelledby="site-title">
      <div class="hero__text">
        <h1 id="site-title">
          ${config.heroPrefix && html`<span class="hero__school">${config.heroPrefix}</span>`}
          <span class="hero__unit">${config.heroTitle}</span>
        </h1>
        ${config.heroText && html`<p class="hero__hours">${config.heroText}</p>`}
      </div>
      <div class="hero__media">
        <div class="hero__dots" aria-hidden="true">${DOTS.map((distance) => html`<i style="--distance: ${distance}"></i>`)}</div>
        <img src="${u.local(images.campusUrl)}" width="841" height="559" fetchpriority="high" alt="${config.campusAlt}" />
      </div>
    </section>
    ${sections.length > 0 && html`<div class="page">
      ${sections.map(({ key, staticSite }) => staticSite.home(site.data[key])(u))}
    </div>`}`);
}

const contentPage = (item) => page(pagePath(item), item.title, (u) => html`
  <div class="page">
    <div class="album-head"><h1 class="stop">${item.title}</h1></div>
    ${articleBody(renderPage(item), u, ' article')}
  </div>`);

// ---- 讀取資料與組合檔案 ----
/** 網站設定、頁面、選單，以及啟用中的擴充功能各自的資料（site.data[代號]） */
async function loadSite(db, storage) {
  const config = await db.prepare('SELECT * FROM site_config').get();
  const images = Object.fromEntries(Object.entries(DEFAULT_IMAGES).map(([field, fallback]) => [field, config[field] ?? fallback]));
  const pages = await db.prepare('SELECT * FROM pages ORDER BY slug').all();
  const extensions = (await enabledExtensions(db)).filter((extension) => extension.staticSite);
  const data = {};
  for (const { key, staticSite } of extensions) data[key] = await staticSite.load({ db, storage });
  // 擴充功能的內容下一次改變的時間（例如預約發布的公告）
  const nextChange = Object.values(data).map((value) => value.nextChange).filter(Boolean).sort()[0] ?? null;
  return {
    config, images, pages, extensions, data, navigation: await readNavigation(db), year: new Date().getFullYear(), nextChange,
  };
}

/** 「a」「a與b」「a、b與c」 */
const listText = (items) => (items.length > 1 ? `${items.slice(0, -1).join('、')}與${items.at(-1)}` : items.join(''));

const siteDescription = ({ config, extensions }) => excerpt(
  `${config.siteTitle}${extensions.length ? `的${listText(extensions.map((extension) => extension.label))}` : ''}。${config.heroText ? `${config.heroText}。` : ''}聯絡電話 ${config.phone}${config.extension ? ` ${config.extension}` : ''}。`,
);

/**
 * 每頁的資料：description、image、type（website、article、gallery、page）、published、modified、
 * breadcrumb（麵包屑）、text（給 AI 的全文），見 src/http/seo.js
 */
function homeMeta(site) {
  const extensionDates = site.extensions.flatMap(({ key, staticSite }) => staticSite.homeModified?.(site.data[key]) ?? []);
  return {
    name: site.config.siteTitle,
    description: siteDescription(site),
    image: site.images.campusUrl,
    type: 'website',
    modified: latest([...extensionDates, ...site.pages.map((p) => p.updatedAt)]),
    breadcrumb: [],
    text: '',
  };
}

function contentMeta(item) {
  const markup = renderPage(item);
  return {
    name: item.title,
    description: excerpt(textOf(markup)) || item.title,
    image: firstImage(markup),
    type: 'page',
    published: item.createdAt,
    modified: item.updatedAt,
    breadcrumb: [HOME_CRUMB],
    text: textOf(markup, { links: true }),
  };
}

/** 網站所有的公開頁面，各自帶有 meta（見上）；擴充功能的頁面由各自的 staticSite.pages 提供 */
const allPages = (site) => [
  { ...homePage(site), meta: homeMeta(site) },
  ...site.extensions.flatMap(({ key, staticSite }) => staticSite.pages(site, site.data[key])),
  ...site.pages.map((item) => ({ ...contentPage(item), meta: contentMeta(item) })),
];

/**
 * 給 <noscript> 用的頁面（src/http/noscript.js）：網址 → { title, body }，body 是頁首、內容與頁尾。
 * 另外回傳預設主題（沒有 JavaScript 時套用在 <html> 上）與下一次公開內容會改變的時間
 */
export async function renderNoscriptPages({ db, storage }) {
  const site = await loadSite(db, storage);
  const pages = new Map(allPages(site).map(({ route, title, body, meta }) => {
    const u = urlsFor(route, 'site');
    const content = html`${header(site, u)}
    <main id="main" tabindex="-1">
      ${body(u)}
    </main>
    ${footer(site, site.year)}`;
    return [route, { ...meta, route, title: fullTitleOf(site, title), body: content.value }];
  }));
  const mode = site.config.defaultTheme === 'DARK' ? 'dark' : 'light';
  const { config } = site;
  return {
    pages,
    // 搜尋引擎、AI 用的網站資訊（src/http/seo.js）
    site: {
      title: config.siteTitle,
      description: siteDescription(site),
      logo: site.images.logoUrl,
      phone: config.phone,
      extension: config.extension,
      hours: config.hours,
      contactTitle: config.footerTitle,
      teachers: config.teachers,
      documents: [],
      // 擴充功能另外提供的資訊，例如文件清單
      ...Object.assign({}, ...site.extensions.map(({ key, staticSite }) => staticSite.info?.(site.data[key]) ?? {})),
      extensionPaths: site.extensions.map((extension) => extension.path),
    },
    theme: { mode, colors: site.config[`${mode}Theme`] },
    nextChange: site.nextChange ? new Date(site.nextChange) : null,
  };
}

/** web 建置出來的樣式表（public/index.html 引用的 CSS）與它用到的字型等檔案；CSS 裡的網址改成相對路徑 */
async function loadStyles(publicDir) {
  const index = await readFile(join(publicDir, 'index.html'), 'utf8').catch(() => fail('找不到網站的建置結果，請先在 web/ 執行 npm run build'));
  const entries = [];
  const styles = [];
  for (const [, href] of index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/(assets\/[^"]+\.css)"/g)) {
    const css = await readFile(join(publicDir, href), 'utf8');
    for (const [, asset] of css.matchAll(/url\(\/(assets\/[^)"']+)\)/g)) entries.push({ name: asset, path: join(publicDir, asset) });
    entries.push({ name: href, data: Buffer.from(css.replace(/url\(\/assets\//g, 'url(./')) });
    styles.push(href);
  }
  return { styles, entries };
}

/** 頁面引用的上傳檔案：壓縮版圖片與文件。壓縮版不見時重新產生 */
async function referencedFiles(htmlFiles, db, storage) {
  const text = htmlFiles.join('\n');
  const displays = new Set([...text.matchAll(/files\/display\/([0-9a-f-]{36})\.webp/g)].map((m) => m[1]));
  const originals = new Set([...text.matchAll(/files\/([0-9a-f-]{36}\.[a-z0-9]+)/g)].map((m) => m[1]));
  const entries = [];
  for (const id of displays) {
    const path = storage.displayPath(id);
    if (!(await stat(path).catch(() => null))) {
      const photo = await db.prepare(`SELECT stored_name FROM photos WHERE stored_name LIKE $1 || '.%'`).get(id);
      if (!photo) continue;
      await storage.createDisplay(photo.storedName).catch((error) => console.error(error));
    }
    if (await stat(path).catch(() => null)) entries.push({ name: `files/display/${id}.webp`, path });
  }
  for (const name of originals) {
    const path = storage.pathOf(name);
    if (await stat(path).catch(() => null)) entries.push({ name: `files/${name}`, path });
  }
  return entries;
}

/** 回傳 ZIP 的檔案清單（見 src/lib/zip.js 的 createZip） */
export async function buildStaticSite({ db, storage, publicDir }) {
  if (!publicDir) fail('找不到網站的建置結果，請先在 web/ 執行 npm run build');
  const { styles, entries: styleEntries } = await loadStyles(publicDir);
  const site = { ...(await loadSite(db, storage)), styles };

  const pages = allPages(site).map((definition) => [
    definition.route === '/' ? 'index.html' : `${definition.route.slice(1)}/index.html`,
    layout(site, definition),
  ]);

  // 沒有上傳的圖片用網站內建的示範圖片
  const builtIn = Object.values(site.images).filter((url) => !url.startsWith('/files/'))
    .map((url) => ({ name: url.slice(1), path: join(publicDir, url.slice(1)) }));

  const entries = [
    ...pages.map(([name, text]) => ({ name, data: Buffer.from(text) })),
    { name: 'site.js', path: fileURLToPath(new URL('./assets/site.js', import.meta.url)) },
    ...styleEntries,
    ...builtIn,
    ...(await referencedFiles(pages.map(([, text]) => text), db, storage)),
  ];
  // 同一個檔案（例如幾個樣式表共用的字型）只放一次
  return [...new Map(entries.map((entry) => [entry.name, entry])).values()];
}
