// 靜態網站與 <noscript> 頁面共用的樣板工具；核心頁面（index.js）與各擴充功能的 static.js 都用這些組出 HTML

// ---- HTML 樣板：${} 的值一律跳脫，已是 HTML 的用 raw() 包起來 ----
export class Raw {
  constructor(value) {
    this.value = value;
  }
}
export const raw = (value) => new Raw(value);
export const escape = (value) => String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const show = (value) => {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(show).join('');
  return value == null || value === false ? '' : escape(value);
};
export const html = (strings, ...values) => raw(strings.reduce((out, text, i) => out + text + (i < values.length ? show(values[i]) : ''), ''));

/**
 * 一個網址（例如 /photos/3）所在頁面用的連結。mode 是 'files'（下載的 ZIP，用相對路徑，直接開啟檔案也能瀏覽）
 * 或 'site'（伺服器在 <noscript> 裡提供的頁面，用網站原本的網址）
 */
export function urlsFor(route, mode = 'files') {
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
export const localizeHtml = (text, u) => raw(text.replace(/\b(href|src)="(\/[^"]*)"/g, (_, attr, url) => `${attr}="${escape(u.local(url.replace(/&amp;/g, '&')))}"`));

/** 一頁的定義：網址、標題與內容；ZIP 用 layout 包成整份文件，<noscript> 用 noscriptBody */
export const page = (route, title, body, { lightbox = false } = {}) => ({ route, title, body, lightbox });

/** 連結寫成 Markdown 的 [文字](網址)；文字就是網址時只留網址，頁內的 # 連結只留文字 */
function linkText(href, inner) {
  if (href.startsWith('#')) return inner;
  const label = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const url = href.replace(/[()\s]/g, (c) => encodeURIComponent(c).replace('(', '%28').replace(')', '%29'));
  if (!url) return inner;
  if (label === href && !href.startsWith('/')) return url;
  return `[${label || url}](${url})`;
}

/**
 * HTML 轉成純文字（描述、給 AI 的全文用）。
 * links 為 true 時保留連結的網址（給 AI 的全文用）；站內連結是 / 開頭的路徑，由 src/http/seo.js 補上網站的網址
 */
export function textOf(markup, { links = false } = {}) {
  return markup
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    // 圖片換成它的說明，只有圖片的頁面（例如位置圖）也有描述
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '\n$1\n')
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => (links ? linkText(href, inner) : inner))
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
export const excerpt = (text, max = 120) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export const firstImage = (markup) => /<img[^>]+src="([^"]+)"/.exec(markup)?.[1] ?? null;
export const latest = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

export const emptyStatus = (text) => html`<div class="list-status"><p>${text}</p></div>`;

export const articleBody = (text, u, extraClass = '') => html`<div class="article__body${extraClass}"><div class="article__chunk">${localizeHtml(text, u)}</div></div>`;

export const HOME_CRUMB = { name: '首頁', route: '/' };

/** 清單頁的 meta（見 index.js 的說明） */
export const listMeta = (name, description, modified, image = null) => ({
  name, description, image, type: 'page', modified, breadcrumb: [HOME_CRUMB], text: '',
});
