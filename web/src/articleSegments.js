import { markdownLink } from './format.js';

const isBlankText = (node) => node.nodeType === 3 && !node.textContent.trim();
// 頁面的 HTML 指定了尺寸、樣式或錨點時，表示作者要自己控制這張圖
const isGalleryImage = (node) => node.nodeName === 'IMG' && node.hasAttribute('src')
  && !['width', 'height', 'class', 'id'].some((name) => node.hasAttribute(name));

const isBlank = (node) => isBlankText(node) || node.nodeName === 'BR';

/** 去掉段落頭尾的空白與換行；沒有內容時回傳 false */
function trimParagraph(paragraph) {
  while (paragraph.firstChild && isBlank(paragraph.firstChild)) paragraph.firstChild.remove();
  while (paragraph.lastChild && isBlank(paragraph.lastChild)) paragraph.lastChild.remove();
  return paragraph.hasChildNodes();
}

/**
 * 把段落裡的圖片拆出來，回傳依原順序排列的節點，例如 [文字段落, 圖片, 文字段落]。
 * 只處理直接放在段落裡的圖片；清單、表格、連結裡的圖片拆出來會破壞結構，維持原樣。
 */
function splitParagraph(node) {
  if (node.nodeName !== 'P' || ![...node.childNodes].some(isGalleryImage)) return [node];

  const parts = [];
  let text = null;
  const flushText = () => {
    if (text && trimParagraph(text)) parts.push(text);
    text = null;
  };
  for (const child of [...node.childNodes]) {
    if (isGalleryImage(child)) {
      flushText();
      parts.push(child);
    } else {
      text ??= node.cloneNode(false);
      text.append(child);
    }
  }
  flushText();
  return parts;
}

/**
 * 把消毒過的內文拆成 HTML 片段與照片組：[{ html }, { photos }, ...]。
 * 相鄰的圖片會合併成同一組，和文字寫在同一段的圖片也會拆出來，都由 PhotoGallery 顯示。
 * 內文的網址只有壓縮版，所以這些照片沒有 originalUrl。
 * sameUrl 記錄內文有幾張同網址的圖片、這是第幾張，修改說明時用來找到原文，見 replaceImageAlt。
 */
export function splitBody(html) {
  if (!html.includes('<img')) return [{ html }];

  const { body } = new DOMParser().parseFromString(html, 'text/html');
  const images = [...body.querySelectorAll('img')];
  const sameUrl = (image) => {
    const matches = images.filter((other) => other.getAttribute('src') === image.getAttribute('src'));
    return { index: matches.indexOf(image), total: matches.length };
  };
  const segments = [];
  let chunk = null;
  let photoId = 0;

  const flush = () => {
    if (chunk) segments.push({ html: chunk.innerHTML });
    chunk = null;
  };

  for (const node of [...body.childNodes]) {
    if (isBlankText(node)) continue;
    for (const part of splitParagraph(node)) {
      if (isGalleryImage(part)) {
        flush();
        const photo = {
          id: String(photoId++),
          url: part.getAttribute('src'),
          alt: part.getAttribute('alt') || '照片',
          sameUrl: sameUrl(part),
        };
        const last = segments.at(-1);
        if (last?.photos) last.photos.push(photo);
        else segments.push({ photos: [photo] });
      } else {
        chunk ??= body.ownerDocument.createElement('div');
        chunk.append(part);
      }
    }
  }
  flush();
  return segments;
}

// ![說明](網址 "標題")，網址可以用角括號包起來
const MARKDOWN_IMAGE = /!\[(?:\\.|[^\]\\])*\]\(\s*(<[^>]*>|[^\s)]+)(\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

function normalizeUrl(url) {
  const bare = url.replace(/^<|>$/g, '');
  try {
    return decodeURI(bare);
  } catch {
    return bare;
  }
}

/**
 * 修改 Markdown 內文裡一張圖片的說明，回傳新的內文。photo 來自 splitBody。
 * 內文和畫面上同網址的圖片數量不同時，無法確定是哪一張（例如寫在程式碼區塊或用 HTML 寫的圖片），
 * 這時丟出錯誤，不冒險改到別張。
 */
export function replaceImageAlt(source, photo, alt) {
  if (!alt) throw new Error('照片說明不可為空。');
  const matches = [...source.matchAll(MARKDOWN_IMAGE)]
    .filter((match) => normalizeUrl(match[1]) === normalizeUrl(photo.url));
  const match = matches[photo.sameUrl.index];
  if (!match || matches.length !== photo.sameUrl.total) {
    throw new Error('內文裡找不到這張圖片，請到編輯畫面修改。');
  }
  const replacement = `!${markdownLink(alt, `${match[1]}${match[2] ?? ''}`)}`;
  return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
}
