const isBlankText = (node) => node.nodeType === 3 && !node.textContent.trim();
// 頁面的 HTML 指定了尺寸、樣式或錨點時，表示作者要自己控制這張圖
const isGalleryImage = (node) => node.nodeName === 'IMG' && node.hasAttribute('src')
  && !['width', 'height', 'class', 'id'].some((name) => node.hasAttribute(name));

/** 這一段全都是圖片時回傳那些圖片，否則回傳 null；和文字寫在同一段的圖片維持原樣 */
function imagesIn(node) {
  if (node.nodeName !== 'P') return null;
  const children = [...node.childNodes].filter((child) => !isBlankText(child) && child.nodeName !== 'BR');
  return children.length && children.every(isGalleryImage) ? children : null;
}

/**
 * 把消毒過的內文拆成 HTML 片段與照片組：[{ html }, { photos }, ...]。
 * 相鄰的圖片會合併成同一組。
 * 內文的網址只有壓縮版，所以這些照片沒有 originalUrl。
 */
export function splitBody(html) {
  if (!html.includes('<img')) return [{ html }];

  const { body } = new DOMParser().parseFromString(html, 'text/html');
  const segments = [];
  let chunk = null;
  let photoId = 0;

  const flush = () => {
    if (chunk) segments.push({ html: chunk.innerHTML });
    chunk = null;
  };

  for (const node of [...body.childNodes]) {
    if (isBlankText(node)) continue;
    const images = imagesIn(node);
    if (images) {
      flush();
      const photos = images.map((image) => ({
        id: String(photoId++),
        url: image.getAttribute('src'),
        alt: image.getAttribute('alt') || '照片',
      }));
      const last = segments.at(-1);
      if (last?.photos) last.photos.push(...photos);
      else segments.push({ photos });
    } else {
      chunk ??= body.ownerDocument.createElement('div');
      chunk.append(node);
    }
  }
  flush();
  return segments;
}
