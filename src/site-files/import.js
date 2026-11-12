// 匯入網站資料，整份取代目前的內容（帳號除外）。先把圖片與文件寫進上傳資料夾、組好所有資料列，
// 最後用 schema.sql 的 import_site() 一次寫入；任何一步失敗都會刪掉這次寫入的檔案，資料庫維持原狀
import { basename, extname } from 'node:path';
import { snakeizeKeys } from '../db/index.js';
import { EXTENSIONS } from '../extensions/index.js';
import { NAV_SERVICES } from '../graphql/navigation.js';
import { fail } from '../lib/errors.js';
import { PLACEHOLDER } from './format.js';
import { readSite } from './read.js';

const DEFAULT_NAVIGATION = { utility: [{ service: 'HOME' }], main: [{ service: 'ANNOUNCEMENTS' }, { service: 'PHOTOS' }] };

/** 資料裡寫的 id 沒重複就沿用（網址不變），其餘的接在後面編號 */
function assignIds(items) {
  const used = new Set();
  for (const item of items) {
    const id = Number(item.id);
    item.id = Number.isSafeInteger(id) && id > 0 && !used.has(id) ? id : null;
    if (item.id) used.add(item.id);
  }
  let next = Math.max(0, ...used);
  for (const item of items) item.id ??= ++next;
}

/** 依 placeholder 換掉內文裡的 {{image:...}}、{{document:...}} */
async function replacePlaceholders(text, resolve) {
  const values = await Promise.all([...text.matchAll(PLACEHOLDER)].map(([, kind, path]) => resolve(kind, path.trim())));
  let index = 0;
  return text.replace(PLACEHOLDER, () => values[index++]);
}

/** 回傳匯入的數量 { pages, announcements, albums, photos, documents } */
export async function importSite({ db, storage, source }) {
  const site = await readSite(source);
  const written = [];
  const photos = [];

  async function saveImage(path, albumId, alt) {
    if (!site.has(path)) fail(`找不到圖片「${path}」`);
    const file = new File([await site.read(path)], basename(path));
    return storage.saveImage(file, async (storedName, filename) => {
      written.push(storedName);
      const row = { id: photos.length + 1, stored_name: storedName, alt, album_id: albumId, filename };
      photos.push(row);
      return row;
    });
  }

  // 內文圖片與網站設定的圖片：同一個檔案只存一次
  const imageUrls = new Map();
  async function contentImage(path) {
    if (!imageUrls.has(path)) {
      const row = await saveImage(path, null, basename(path, extname(path)) || 'image');
      imageUrls.set(path, storage.displayUrlOf({ storedName: row.stored_name }));
    }
    return imageUrls.get(path);
  }

  try {
    const documents = [];
    const documentUrls = new Map();
    for (const [index, doc] of site.documents.entries()) {
      const bytes = await site.read(doc.path);
      const storedName = await storage.save(bytes, extname(doc.filename).toLowerCase(), async (name) => name);
      written.push(storedName);
      documents.push({
        id: index + 1, stored_name: storedName, title: doc.title, category: doc.category, filename: doc.filename, size: bytes.length,
        ...(doc.createdAt && { created_at: doc.createdAt }),
      });
      documentUrls.set(doc.file, storage.urlOf({ storedName }));
    }

    const resolve = async (kind, path) => {
      if (kind === 'image') return contentImage(`images/${path}`);
      return documentUrls.get(path) ?? fail(`內容引用的文件「documents/${path}」不存在`);
    };

    // 最後編輯的帳號：帳號不在匯出的資料裡，這個網站沒有同名的帳號時就不記錄
    const usernames = new Set((await db.prepare('SELECT username FROM users').all()).map((user) => user.username));
    const pages = [];
    for (const page of site.pages) {
      pages.push({
        slug: page.slug, root: page.root, title: page.title, format: page.format, source: await replacePlaceholders(page.source, resolve),
        ...(page.createdAt && { created_at: page.createdAt }),
        ...(page.updatedAt && { updated_at: page.updatedAt }),
        ...(usernames.has(page.updatedBy) && { updated_by: page.updatedBy }),
      });
    }

    assignIds(site.announcements);
    const announcements = [];
    for (const { content, ...item } of site.announcements) {
      announcements.push({ ...snakeizeKeys(item), content: await replacePlaceholders(content, resolve) });
    }

    assignIds(site.albums);
    const albums = [];
    for (const { photos: albumPhotos, ...album } of site.albums) {
      albums.push(snakeizeKeys(album));
      for (const photo of albumPhotos) await saveImage(photo.path, album.id, photo.alt);
    }

    const { images = {}, ...settings } = site.config ?? {};
    const config = { ...snakeizeKeys(settings), id: true };
    for (const [field, name] of Object.entries(images)) {
      Object.assign(config, snakeizeKeys({ [field]: await contentImage(`branding/${name}`) }));
    }

    const slugs = new Set(pages.map((page) => page.slug));
    const navigation = site.navigation ?? DEFAULT_NAVIGATION;
    const links = Object.entries({ UTILITY: navigation.utility, MAIN: navigation.main }).flatMap(([menu, items]) => (items ?? [])
      .filter(({ page, service }) => (page ? slugs.has(page) : NAV_SERVICES.includes(service)))
      .map(({ page = null, service = null }, position) => ({ menu, position, page_slug: page, service: page ? null : service })));

    // 只保留這個網站有的擴充功能，值要是 true 或 false
    const states = site.extensions && typeof site.extensions === 'object' && !Array.isArray(site.extensions) ? site.extensions : {};
    const extensions = EXTENSIONS.filter(({ key }) => typeof states[key] === 'boolean').map(({ key }) => ({ key, enabled: states[key] }));

    const previous = (await db.prepare('SELECT stored_name FROM photos UNION ALL SELECT stored_name FROM documents').all())
      .map((row) => row.storedName);
    await db.prepare('SELECT import_site($1::jsonb)').run(JSON.stringify({
      pages, announcements, albums, photos, documents, site_config: [config], navigation_links: links, daily_visits: site.visits, extensions,
    }));
    await storage.removeFiles(previous);

    return {
      pages: pages.length,
      announcements: announcements.length,
      albums: albums.length,
      photos: photos.filter((photo) => photo.album_id !== null).length,
      documents: documents.length,
    };
  } catch (error) {
    await storage.removeFiles(written);
    throw error;
  }
}
