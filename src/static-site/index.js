// 把網站輸出成靜態的 HTML 檔（網站設定的「下載靜態網站」）。
// 版面和 web/ 的 Vue 元件一致（共用 style.css 與 web/src 的格式函式），但只有公開內容：已發布的公告、有照片的相簿、頁面與文件。
// 每個網址是一個資料夾裡的 index.html，連結都是相對路徑，放到任何網頁伺服器或直接開啟檔案都能瀏覽。
// 修改 web/ 的版面時，這裡的對應樣板也要一起改
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IMAGES } from '../../web/src/defaultImages.js';
import {
  fileSizeText, groupByYear, groupDocuments, monthDayText, parseAlbum, rocDateText, rocDateTimeText, rocShortDate, telHref, wasEdited,
} from '../../web/src/format.js';
import { mapMenus, menuLink, pagePath } from '../../web/src/navigation.js';
import { readNavigation } from '../graphql/navigation.js';
import { renderAnnouncement, renderPage } from '../lib/content.js';
import { fail } from '../lib/errors.js';

const COPYRIGHT = 'CatTimothy'; // 和 web/src/components/SiteFooter.vue 一致
const GITHUB_URL = 'https://github.com/CatTimothy/ncue-ResRoom';
const HOME_ANNOUNCEMENTS = 5;
const HOME_ALBUMS = 6;
const SECTION_PHOTOS = 24; // 活動剪影每本相簿先顯示的張數，和 AlbumSection.vue 一致
const NAV_LABELS = { utility: '輔助選單', main: '主選單' };

// ---- HTML 樣板：${} 的值一律跳脫，已是 HTML 的用 raw() 包起來 ----
class Raw {
  constructor(value) {
    this.value = value;
  }
}
const raw = (value) => new Raw(value);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const show = (value) => {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(show).join('');
  return value == null || value === false ? '' : escape(value);
};
const html = (strings, ...values) => raw(strings.reduce((out, text, i) => out + text + (i < values.length ? show(values[i]) : ''), ''));

/**
 * 一個網址（例如 /photos/3）所在頁面用的連結。mode 是 'files'（下載的 ZIP，用相對路徑，直接開啟檔案也能瀏覽）
 * 或 'site'（伺服器在 <noscript> 裡提供的頁面，用網站原本的網址）
 */
function urlsFor(route, mode = 'files') {
  if (mode === 'site') return { route, mode, to: (path) => path, local: (url) => url };
  const depth = route === '/' ? 0 : route.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  const to = (path) => (path === '/' ? `${prefix}index.html` : `${prefix}${path.replace(/^\/|\/$/g, '')}/index.html`);
  /** 網站內的絕對網址換成相對路徑；檔案直接對應，其他網址當作頁面 */
  const local = (url) => {
    if (!url.startsWith('/') || url.startsWith('//')) return url;
    const [, path, suffix = ''] = /^([^?#]*)(?:\?[^#]*)?(#.*)?$/.exec(url);
    if (path.startsWith('/files/') || /\.[a-z0-9]+$/i.test(path)) return prefix + path.slice(1) + suffix;
    return to(path) + suffix;
  };
  return { route, mode, to, local };
}

/** API 消毒過的內文：網址改成相對路徑 */
const localizeHtml = (text, u) => raw(text.replace(/\b(href|src)="(\/[^"]*)"/g, (_, attr, url) => `${attr}="${escape(u.local(url.replace(/&amp;/g, '&')))}"`));

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

/** 一頁的定義：網址、標題與內容；ZIP 用 layout 包成整份文件，<noscript> 用 noscriptBody */
const page = (route, title, body, { lightbox = false } = {}) => ({ route, title, body, lightbox });

/** HTML 轉成純文字（描述、給 AI 的全文用） */
export function textOf(markup) {
  return markup
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // 圖片換成它的說明，只有圖片的頁面（例如位置圖）也有描述
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '\n$1\n')
    // 區塊元素換行；行內元素（strong、a 等）直接拿掉，中文的字才不會被空白隔開
    .replace(/<br\s*\/?>|<\/(p|h[1-6]|li|div|tr|td|th|dt|dd|blockquote|pre|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}

/** 搜尋結果與分享時顯示的描述：一行、最多 max 字 */
const excerpt = (text, max = 120) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const firstImage = (markup) => /<img[^>]+src="([^"]+)"/.exec(markup)?.[1] ?? null;
const latest = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

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

// ---- 各頁的內容，對應 web/src/views ----
const emptyStatus = (text) => html`<div class="list-status"><p>${text}</p></div>`;

const articleBody = (text, u, extraClass = '') => html`<div class="article__body${extraClass}"><div class="article__chunk">${localizeHtml(text, u)}</div></div>`;

function announcementList(items, u) {
  return groupByYear(items).map((group) => html`
    <div class="announcement-year">
      <p class="announcement-year__label">${group.year} 年</p>
      <ol class="announcement-list">
        ${group.items.map((item) => html`
        <li>
          <time class="date__day" datetime="${item.publishedAt}" aria-label="${rocDateText(item.publishedAt)}">${monthDayText(item.publishedAt)}</time>
          <div>
            <a href="${u.to(`/announcements/${item.id}`)}">${item.title}</a>
            ${wasEdited(item) && html`<small class="edited edited--short">(編輯於 ${rocShortDate(item.modifiedAt)})</small>`}
          </div>
        </li>`)}
      </ol>
    </div>`);
}

function albumGrid(albums, u) {
  if (!albums.length) return '';
  return html`<ul class="album-grid">${albums.map((album) => {
    const title = parseAlbum(album.name);
    return html`
    <li>
      <div class="album-card__cover"><img src="${u.local(album.photos[0].url)}" alt="" loading="lazy" decoding="async" /></div>
      ${title.term && html`<p class="term">${title.term}</p>`}
      <h3><a href="${u.to(`/photos/${album.id}`)}">${title.name}</a></h3>
      <p class="album-card__meta"><time datetime="${album.eventDate}">${rocDateText(album.eventDate)}</time>，${album.photos.length} 張</p>
    </li>`;
  })}</ul>`;
}

function albumHeader(album, u, { heading = 'h1', id = null, linked = false } = {}) {
  const title = parseAlbum(album.name);
  const name = linked ? html`<a href="${u.to(`/photos/${album.id}`)}">${title.name}</a>` : title.name;
  return html`
    <header class="album-head">
      <div>
        ${title.term && html`<p class="term">${title.term}</p>`}
        ${raw(`<${heading}${id ? ` id="${id}"` : ''} class="stop">`)}${name}${raw(`</${heading}>`)}
        <p class="article__date">活動日期：<time datetime="${album.eventDate}">${rocDateText(album.eventDate)}</time>，${album.photos.length} 張</p>
        ${wasEdited(album) && html`<small class="edited edited--short">(編輯於 ${rocShortDate(album.modifiedAt)})</small>`}
      </div>
    </header>`;
}

const photoGrid = (photos, u) => html`
  <ul class="photo-grid">
    ${photos.map((photo) => html`
    <li>
      ${u.mode === 'site'
    ? html`<a class="photo-grid__open" href="${photo.url}" aria-label="開啟照片：${photo.alt}"><img src="${photo.url}" alt="${photo.alt}" loading="lazy" decoding="async" /></a>`
    : html`<button type="button" class="photo-grid__open" aria-label="放大照片：${photo.alt}" data-src="${u.local(photo.url)}" data-alt="${photo.alt}">
        <img src="${u.local(photo.url)}" alt="${photo.alt}" loading="lazy" decoding="async" />
      </button>`}
    </li>`)}
  </ul>`;

const DOTS = Array.from({ length: 9 * 7 }, (_, i) => Math.round(Math.hypot(i % 9, 6 - Math.floor(i / 9))));

function homePage(site) {
  const { config, images, announcements, albums } = site;
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
    <div class="page">
      <section aria-labelledby="home-news">
        <div class="section-head stop">
          <h2 id="home-news">最新消息</h2>
          ${announcements.length > 0 && html`<a href="${u.to('/announcements')}">查看所有消息</a>`}
        </div>
        ${announcementList(announcements.slice(0, HOME_ANNOUNCEMENTS), u)}
        ${!announcements.length && emptyStatus('目前沒有新消息。')}
      </section>
      <section aria-labelledby="home-photos">
        <div class="section-head stop">
          <h2 id="home-photos">活動剪影</h2>
          ${albums.length > 0 && html`<a href="${u.to('/photos')}">查看所有相簿</a>`}
        </div>
        ${albumGrid(albums.slice(0, HOME_ALBUMS), u)}
        ${!albums.length && emptyStatus('目前沒有相簿。')}
      </section>
    </div>`);
}

const announcementsPage = (site) => page('/announcements', '最新消息', (u) => html`
  <div class="page">
    <h1 class="stop">最新消息</h1>
    <div>
      ${announcementList(site.announcements, u)}
      ${!site.announcements.length && emptyStatus('目前沒有新消息。')}
    </div>
  </div>`);

function announcementPage(item) {
  const info = [
    ['公告單位', item.unit || '—'],
    ['瀏覽人次', item.views],
    ['公告日期', html`<time datetime="${item.publishedAt}">${rocShortDate(item.publishedAt)}</time>`],
    ['截止日期', item.deadline ? html`<time datetime="${item.deadline}">${rocShortDate(item.deadline)}</time>` : '—'],
    ['聯絡人', item.contactPerson || '—'],
    ['分機', item.extension || '—'],
  ];
  return page(`/announcements/${item.id}`, item.title, (u) => html`
    <div class="page">
      <a class="back-link" href="${u.to('/announcements')}">回到最新消息</a>
      <article class="article">
        <p class="announcement__label">公告標題</p>
        <h1 class="stop">${item.title}</h1>
        <dl class="announcement-info">
          ${info.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}
        </dl>
        <h2 class="announcement__body-title">詳細內容</h2>
        ${articleBody(renderAnnouncement(item), u)}
        ${wasEdited(item) && html`<small class="edited">編輯於 ${rocDateTimeText(item.modifiedAt)}</small>`}
      </article>
    </div>`);
}

const albumsPage = (site) => page('/photos', '活動剪影', (u) => html`
  <div class="page">
    <h1 class="stop">活動剪影</h1>
    <div>
      ${site.albums.map((album) => html`
      <section class="album-section" aria-labelledby="album-${album.id}">
        ${albumHeader(album, u, { heading: 'h2', id: `album-${album.id}`, linked: true })}
        <div class="album-section__photos">
          ${photoGrid(album.photos.slice(0, SECTION_PHOTOS), u)}
          ${album.photos.length > SECTION_PHOTOS && html`<p><a href="${u.to(`/photos/${album.id}`)}">查看全部 ${album.photos.length} 張照片</a></p>`}
        </div>
      </section>`)}
      ${!site.albums.length && emptyStatus('目前沒有相簿。')}
    </div>
  </div>`, { lightbox: true });

const albumPage = (album) => page(`/photos/${album.id}`, parseAlbum(album.name).name, (u) => html`
  <div class="page">
    <a class="back-link" href="${u.to('/photos')}">回到所有相簿</a>
    ${albumHeader(album, u)}
    <div>${photoGrid(album.photos, u)}</div>
  </div>`, { lightbox: true });

const documentsPage = (site) => page('/documents', '文件下載', (u) => html`
  <div class="page">
    <h1 class="stop">文件下載</h1>
    <div>
      ${groupDocuments(site.documents).map(([name, documents]) => html`
      <section class="document-group">
        <div class="document-group__head"><h2>${name}</h2></div>
        <ul class="document-list">
          ${documents.map((item) => html`
          <li>
            <div class="document-list__main">
              <a href="${u.local(item.url)}" download="${item.filename}">${item.title}</a>
              <small class="edited">${item.filename.split('.').pop().toUpperCase()}，${fileSizeText(item.size)}</small>
            </div>
          </li>`)}
        </ul>
      </section>`)}
      ${!site.documents.length && emptyStatus('目前沒有文件。')}
    </div>
  </div>`);

const contentPage = (item) => page(pagePath(item), item.title, (u) => html`
  <div class="page">
    <div class="album-head"><h1 class="stop">${item.title}</h1></div>
    ${articleBody(renderPage(item), u, ' article')}
  </div>`);

// ---- 讀取資料與組合檔案 ----
async function loadSite(db, storage) {
  const config = await db.prepare('SELECT * FROM site_config').get();
  const images = Object.fromEntries(Object.entries(DEFAULT_IMAGES).map(([field, fallback]) => [field, config[field] ?? fallback]));
  const announcements = await db.prepare(`
    SELECT * FROM announcements WHERE published_at <= now() ORDER BY published_at DESC, id DESC
  `).all();
  const albums = await db.prepare(`
    SELECT * FROM albums a WHERE EXISTS (SELECT 1 FROM photos p WHERE p.album_id = a.id) ORDER BY event_date DESC, id DESC
  `).all();
  const photos = await db.prepare('SELECT * FROM photos WHERE album_id IS NOT NULL ORDER BY id DESC').all();
  for (const album of albums) {
    album.photos = photos.filter((photo) => photo.albumId === album.id).map((photo) => ({ ...photo, url: storage.displayUrlOf(photo) }));
  }
  const documents = (await db.prepare('SELECT * FROM documents ORDER BY id DESC').all())
    .map((row) => ({ ...row, url: storage.urlOf(row) }));
  const pages = await db.prepare('SELECT * FROM pages ORDER BY slug').all();
  // 下一則預約發布的公告：到時候公開內容會改變
  const { next } = await db.prepare('SELECT min(published_at) AS next FROM announcements WHERE published_at > now()').get();
  return {
    config, images, announcements, albums, documents, pages, navigation: await readNavigation(db), year: new Date().getFullYear(), nextChange: next,
  };
}

const siteDescription = ({ config }) => excerpt(
  `${config.siteTitle}的最新消息、活動剪影與文件下載。${config.heroText ? `${config.heroText}。` : ''}聯絡電話 ${config.phone}${config.extension ? ` ${config.extension}` : ''}。`,
);

const HOME_CRUMB = { name: '首頁', route: '/' };

/**
 * 每頁的資料：description、image、type（website、article、gallery、page）、published、modified、
 * breadcrumb（麵包屑）、text（給 AI 的全文），見 src/http/seo.js
 */
function homeMeta(site) {
  return {
    name: site.config.siteTitle,
    description: siteDescription(site),
    image: site.images.campusUrl,
    type: 'website',
    modified: latest([...site.announcements.map((a) => a.modifiedAt), ...site.pages.map((p) => p.updatedAt)]),
    breadcrumb: [],
    text: '',
  };
}

function announcementMeta(item) {
  const markup = renderAnnouncement(item);
  const info = [item.unit && `公告單位：${item.unit}`, item.contactPerson && `聯絡人：${item.contactPerson}`, item.extension && `分機：${item.extension}`]
    .filter(Boolean).join('，');
  return {
    name: item.title,
    description: excerpt(textOf(markup)) || item.title,
    image: firstImage(markup),
    type: 'article',
    published: item.publishedAt,
    modified: item.modifiedAt,
    breadcrumb: [HOME_CRUMB, { name: '最新消息', route: '/announcements' }],
    text: [info, textOf(markup)].filter(Boolean).join('\n'),
  };
}

function albumMeta(album) {
  const title = parseAlbum(album.name);
  return {
    name: title.name,
    description: `${title.term ? `${title.term} ` : ''}${title.name}，活動日期${rocDateText(album.eventDate)}，共 ${album.photos.length} 張照片。`,
    image: album.photos[0]?.url ?? null,
    images: album.photos.slice(0, 20).map((photo) => ({ url: photo.url, alt: photo.alt })),
    type: 'gallery',
    published: album.eventDate,
    modified: album.modifiedAt,
    breadcrumb: [HOME_CRUMB, { name: '活動剪影', route: '/photos' }],
    text: album.photos.map((photo) => photo.alt).join('、'),
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
    text: textOf(markup),
  };
}

const listMeta = (name, description, modified, image = null) => ({
  name, description, image, type: 'page', modified, breadcrumb: [HOME_CRUMB], text: '',
});

/** 網站所有的公開頁面，各自帶有 meta（見上） */
const allPages = (site) => [
  { ...homePage(site), meta: homeMeta(site) },
  {
    ...announcementsPage(site),
    meta: listMeta('最新消息', `${site.config.siteTitle}的最新消息，共 ${site.announcements.length} 則公告。`, latest(site.announcements.map((a) => a.modifiedAt))),
  },
  ...site.announcements.map((item) => ({ ...announcementPage(item), meta: announcementMeta(item) })),
  {
    ...albumsPage(site),
    meta: listMeta('活動剪影', `${site.config.siteTitle}的活動剪影，共 ${site.albums.length} 本相簿。`, latest(site.albums.map((a) => a.modifiedAt)), site.albums[0]?.photos[0]?.url),
  },
  ...site.albums.map((album) => ({ ...albumPage(album), meta: albumMeta(album) })),
  {
    ...documentsPage(site),
    meta: listMeta('文件下載', `${site.config.siteTitle}的文件下載，共 ${site.documents.length} 份文件，包含申請表與紀錄表等表單。`, latest(site.documents.map((d) => d.createdAt))),
  },
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
      documents: site.documents.map((doc) => ({ title: doc.title, category: doc.category, url: doc.url, filename: doc.filename })),
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
