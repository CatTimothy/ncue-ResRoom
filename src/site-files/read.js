// 讀出網站資料的內容（還沒寫進資料庫）。圖片與文件只記路徑，用到時才用 source.read 讀取
import { basename, extname, posix } from 'node:path';
import { parsePageUrl } from '../../web/src/navigation.js';
import { fail } from '../lib/errors.js';
import { parseFrontMatter, textOf } from './format.js';

const PAGE_FORMATS = { '.md': 'MARKDOWN', '.markdown': 'MARKDOWN', '.html': 'HTML', '.htm': 'HTML' };
const IMAGE = /\.(jpe?g|png|gif|webp|avif|tiff?)$/i;
const DOCUMENT_INDEX = 'documents/documents.json';

const baseName = (path) => basename(path, extname(path));

export async function readSite(source) {
  const { paths } = source;
  const has = (path) => paths.includes(path);
  const text = async (path) => textOf(await source.read(path));
  async function json(path, fallback) {
    if (!has(path)) return fallback;
    try {
      return JSON.parse(await text(path));
    } catch {
      return fail(`「${path}」不是正確的 JSON`);
    }
  }
  const under = (dir) => paths.filter((path) => path.startsWith(`${dir}/`));

  const pages = [];
  for (const path of under('pages')) {
    const match = /^pages\/([^/]+)(\.[a-z]+)$/i.exec(path);
    const format = match && PAGE_FORMATS[match[2].toLowerCase()];
    if (!format) continue;
    const { data, body } = parseFrontMatter(await text(path));
    // front matter 的 path 決定網址（/about 在第一層，/pages/about 或沒寫在 /pages 底下）；沒寫時 slug 是檔名
    const url = data.path ? parsePageUrl(String(data.path)) : { slug: match[1], root: false };
    if (!url) fail(`「${path}」的 path 格式不正確`);
    pages.push({ ...url, title: String(data.title ?? url.slug), format, source: body, createdAt: data.createdAt ?? null, updatedAt: data.updatedAt ?? null });
  }

  const announcements = [];
  for (const path of under('announcements').filter((p) => /^announcements\/[^/]+\.md$/i.test(p))) {
    const { data, body } = parseFrontMatter(await text(path));
    announcements.push({ ...data, title: String(data.title ?? baseName(path)), content: body });
  }

  // 每本相簿是 albums/ 底下的一個資料夾；album.json 寫名稱、日期與照片說明，沒寫的照片說明用檔名
  const folders = [...new Set(under('albums').filter((p) => p.split('/').length === 3).map((p) => p.split('/')[1]))];
  const albums = [];
  for (const folder of folders) {
    const meta = await json(`albums/${folder}/album.json`, {});
    const files = under(`albums/${folder}`).filter((p) => p.split('/').length === 3 && IMAGE.test(p)).map((p) => p.split('/')[2]);
    const listed = (Array.isArray(meta.photos) ? meta.photos : []).filter((photo) => files.includes(photo?.file));
    const rest = files.filter((file) => !listed.some((photo) => photo.file === file)).map((file) => ({ file, alt: baseName(file) }));
    albums.push({
      ...meta,
      name: String(meta.name ?? folder),
      photos: [...listed, ...rest].map((photo) => ({ path: `albums/${folder}/${photo.file}`, alt: String(photo.alt || baseName(photo.file)) })),
    });
  }

  // 文件的分類是所在的資料夾，標題是檔名；documents.json 可以另外寫標題、分類與建立時間
  const index = new Map((await json(DOCUMENT_INDEX, [])).map((item) => [item.file, item]));
  const documents = under('documents').filter((path) => path !== DOCUMENT_INDEX).map((path) => {
    const file = path.slice('documents/'.length);
    const meta = index.get(file) ?? {};
    const folder = posix.dirname(file);
    return {
      path,
      file,
      filename: basename(file),
      title: String(meta.title ?? baseName(file)),
      category: meta.category === undefined ? (folder === '.' ? null : folder) : meta.category,
      createdAt: meta.createdAt ?? null,
    };
  });

  return {
    has,
    read: source.read,
    config: await json('site-config.json', null),
    navigation: await json('navigation.json', null),
    visits: await json('visits.json', []),
    extensions: await json('extensions.json', {}),
    pages,
    announcements,
    albums,
    documents,
  };
}
