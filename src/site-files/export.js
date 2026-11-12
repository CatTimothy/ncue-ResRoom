// 把網站資料輸出成和 seed/ 一樣的資料夾結構（打包成 ZIP 的檔案清單，見 src/lib/zip.js）。
// 資料取自 schema.sql 的 export_site()，同一個快照，輸出時有人在編輯也不會前後不一致
import { stat } from 'node:fs/promises';
import { extname, parse } from 'node:path';
import { pagePath } from '../../web/src/navigation.js';
import { safeName, stringifyFrontMatter } from './format.js';

const toCamelCase = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const camelize = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamelCase(key), value]));
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const IMAGE_FIELDS = ['faviconUrl', 'logoUrl', 'campusUrl'];

export async function exportSiteFiles({ db, storage }) {
  const { tables } = await db.prepare('SELECT export_site() AS tables').get();
  const entries = [];
  const usedNames = new Set();

  /** 同一個路徑已經用過時，在副檔名前加上 (2)、(3)… */
  function unique(path) {
    const { dir, name, ext } = parse(path);
    let candidate = path;
    for (let n = 2; usedNames.has(candidate.toLowerCase()); n++) candidate = `${dir}/${name} (${n})${ext}`;
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }

  /** 上傳的檔案；不見的檔案（例如只還原了資料庫）略過 */
  async function addFile(name, storedName) {
    const path = storage.pathOf(storedName);
    if (await stat(path).catch(() => null)) entries.push({ name, path });
  }

  const photoOf = new Map(tables.photos.map((photo) => [parse(photo.stored_name).name, photo]));
  const photoFileName = (photo) => safeName(photo.filename ?? `${photo.alt}${extname(photo.stored_name)}`, `image${extname(photo.stored_name)}`);

  // 文件：分類是資料夾，documents.json 記標題與分類，匯入時還原
  const documentPaths = new Map();
  const documentIndex = [];
  for (const doc of [...tables.documents].sort((a, b) => a.id - b.id)) {
    const path = unique(`documents/${doc.category ? `${safeName(doc.category)}/` : ''}${safeName(doc.filename)}`);
    const file = path.slice('documents/'.length);
    documentPaths.set(doc.stored_name, file);
    documentIndex.push({ file, title: doc.title, category: doc.category, createdAt: doc.created_at });
    await addFile(path, doc.stored_name);
  }
  if (documentIndex.length) entries.push({ name: 'documents/documents.json', data: json(documentIndex) });

  // 內文用到的圖片放在 images/，內文改寫成 {{image:...}}；同一張圖只放一次
  const imagePaths = new Map();
  async function imagePath(photo, dir) {
    const key = `${dir}:${photo.stored_name}`;
    if (!imagePaths.has(key)) {
      const path = unique(`${dir}/${photoFileName(photo)}`);
      imagePaths.set(key, path.slice(dir.length + 1));
      await addFile(path, photo.stored_name);
    }
    return imagePaths.get(key);
  }

  async function withPlaceholders(text) {
    const replacements = new Map();
    for (const [url, id] of text.matchAll(/\/files\/display\/([0-9a-f-]{36})\.webp/g)) {
      const photo = photoOf.get(id);
      if (photo) replacements.set(url, `{{image:${await imagePath(photo, 'images')}}}`);
    }
    for (const [url, storedName] of text.matchAll(/\/files\/([0-9a-f-]{36}\.[a-z0-9]+)/g)) {
      const photo = photoOf.get(parse(storedName).name);
      if (documentPaths.has(storedName)) replacements.set(url, `{{document:${documentPaths.get(storedName)}}}`);
      else if (photo) replacements.set(url, `{{image:${await imagePath(photo, 'images')}}}`);
    }
    let result = text;
    for (const [url, placeholder] of replacements) result = result.split(url).join(placeholder);
    return result;
  }

  for (const page of tables.pages) {
    entries.push({
      name: unique(`pages/${page.slug}.${page.format === 'HTML' ? 'html' : 'md'}`),
      data: Buffer.from(stringifyFrontMatter({ title: page.title, path: pagePath(page), createdAt: page.created_at, updatedAt: page.updated_at }, await withPlaceholders(page.source))),
    });
  }

  for (const { content, ...item } of [...tables.announcements].sort((a, b) => a.id - b.id)) {
    entries.push({
      name: unique(`announcements/${item.published_at.slice(0, 10)}-${item.id}.md`),
      data: Buffer.from(stringifyFrontMatter(camelize(item), await withPlaceholders(content))),
    });
  }

  for (const album of [...tables.albums].sort((a, b) => a.id - b.id)) {
    const folder = unique(`albums/${album.event_date} ${safeName(album.name, 'album')}`);
    const photos = [];
    for (const photo of tables.photos.filter((p) => p.album_id === album.id).sort((a, b) => a.id - b.id)) {
      const path = unique(`${folder}/${photoFileName(photo)}`);
      photos.push({ file: path.slice(folder.length + 1), alt: photo.alt });
      await addFile(path, photo.stored_name);
    }
    entries.push({ name: `${folder}/album.json`, data: json({ ...camelize(album), photos }) });
  }

  // 網站設定：上傳的圖片放在 branding/
  const { id, ...config } = camelize(tables.site_config[0]);
  const images = {};
  for (const field of IMAGE_FIELDS) {
    const photo = config[field] && photoOf.get(parse(config[field]).name);
    if (photo) images[field] = await imagePath(photo, 'branding');
    delete config[field];
  }
  entries.push({ name: 'site-config.json', data: json({ ...config, images }) });

  const navigation = { utility: [], main: [] };
  for (const link of [...tables.navigation_links].sort((a, b) => a.position - b.position)) {
    navigation[link.menu.toLowerCase()].push(link.page_slug ? { page: link.page_slug } : { service: link.service });
  }
  entries.push({ name: 'navigation.json', data: json(navigation) });
  entries.push({ name: 'visits.json', data: json(tables.daily_visits) });
  // 擴充功能的啟用狀態 { 代號: true | false }；沒有列出的視為啟用
  if (tables.extensions.length) {
    entries.push({ name: 'extensions.json', data: json(Object.fromEntries(tables.extensions.map((row) => [row.key, row.enabled]))) });
  }

  return entries;
}
