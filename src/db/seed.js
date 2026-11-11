// npm run seed-content：把 seed/ 的內容加進網站。seed/ 和「輸出網站資料」是同一種格式（見 src/site-files），
// 但這裡只會補上沒有的內容，不會取代：已存在的頁面、同名的文件、公告與相簿、已放了頁面的頁首選單、改過的網站設定都不動
import { basename, extname } from 'node:path';
import { writeNavigation } from '../graphql/navigation.js';
import { fail } from '../lib/errors.js';
import { PLACEHOLDER } from '../site-files/format.js';
import { readSite } from '../site-files/read.js';
import { directorySource } from '../site-files/sources.js';
import { snakeizeKeys } from './index.js';

/** 公告的 front matter 可以寫的欄位（id 與瀏覽人次由資料庫產生） */
const ANNOUNCEMENT_COLUMNS = ['title', 'content', 'unit', 'deadline', 'contact_person', 'extension', 'published_at', 'created_at', 'modified_at'];

const imageFile = async (site, path) => {
  if (!site.has(path)) fail(`找不到圖片「${path}」`);
  return new File([await site.read(path)], basename(path));
};

/**
 * 網站設定：文字只寫入還是資料庫預設值（示範內容）的欄位，圖片只在還沒設定（使用內建示範圖片）時上傳
 */
async function seedSiteConfig({ db, storage, site }) {
  if (!site.config) return;
  const { images = {}, ...settings } = site.config;

  // 欄位預設值的運算式來自 schema.sql，直接查詢就能得到預設值
  const columns = await db.prepare(`
    SELECT column_name, column_default FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'site_config' AND column_default IS NOT NULL
  `).all();
  const defaults = await db.prepare(`SELECT ${columns.map((c) => `${c.columnDefault} AS ${c.columnName}`).join(', ')}`).get();
  const current = await db.prepare('SELECT * FROM site_config').get();

  const patch = Object.fromEntries(Object.entries(settings).filter(
    ([key]) => key in current && JSON.stringify(current[key]) === JSON.stringify(defaults[key]),
  ));
  for (const [field, name] of Object.entries(images)) {
    if (current[field] !== null) continue;
    patch[field] = (await storage.saveContentImage(await imageFile(site, `branding/${name}`))).url;
  }
  if (!Object.keys(patch).length) return;

  const row = snakeizeKeys(patch);
  const names = Object.keys(row);
  await db.prepare(`
    UPDATE site_config c SET ${names.map((name) => `${name} = r.${name}`).join(', ')}
    FROM jsonb_populate_record(NULL::site_config, $1::jsonb) AS r
  `).run(JSON.stringify(row));
}

export async function seedContent({ db, storage, seedDir }) {
  const site = await readSite(await directorySource(seedDir));
  await seedSiteConfig({ db, storage, site });

  // 文件：新到舊顯示，所以倒序加入才會符合檔名順序
  const documentUrls = new Map();
  for (const doc of [...site.documents].sort((a, b) => (a.path < b.path ? 1 : -1))) {
    const existing = await db.prepare('SELECT stored_name FROM documents WHERE title = $1').get(doc.title);
    if (existing) {
      documentUrls.set(doc.file, storage.urlOf(existing));
      continue;
    }
    const bytes = await site.read(doc.path);
    const storedName = await storage.save(bytes, extname(doc.filename).toLowerCase(), async (name) => {
      await db.prepare(`
        INSERT INTO documents (stored_name, title, category, filename, size) VALUES ($1, $2, $3, $4, $5)
      `).run(name, doc.title, doc.category, doc.filename, bytes.length);
      return name;
    });
    documentUrls.set(doc.file, storage.urlOf({ storedName }));
  }

  async function resolveContent(text) {
    const values = [];
    for (const [, kind, path] of text.matchAll(PLACEHOLDER)) {
      values.push(kind === 'image'
        ? (await storage.saveContentImage(await imageFile(site, `images/${path.trim()}`))).url
        : documentUrls.get(path.trim()) ?? fail(`內容引用的文件「documents/${path.trim()}」不存在`));
    }
    let index = 0;
    return text.replace(PLACEHOLDER, () => values[index++]);
  }

  for (const page of site.pages) {
    if (await db.prepare('SELECT 1 FROM pages WHERE slug = $1').get(page.slug)) continue;
    await db.prepare('INSERT INTO pages (slug, root, title, format, source) VALUES ($1, $2, $3, $4, $5)')
      .run(page.slug, page.root, page.title, page.format, await resolveContent(page.source));
  }

  if (site.navigation && !(await db.prepare('SELECT 1 FROM navigation_links WHERE page_slug IS NOT NULL').get())) {
    const slugs = new Set((await db.prepare('SELECT slug FROM pages').all()).map((row) => row.slug));
    const keep = (items = []) => items.filter(({ page }) => !page || slugs.has(page));
    await writeNavigation(db, { utility: keep(site.navigation.utility), main: keep(site.navigation.main) });
  }

  for (const { content, id, views, ...item } of site.announcements) {
    if (await db.prepare('SELECT 1 FROM announcements WHERE title = $1').get(item.title)) continue;
    const row = { ...snakeizeKeys(item), content: await resolveContent(content) };
    const names = Object.keys(row).filter((name) => ANNOUNCEMENT_COLUMNS.includes(name));
    await db.prepare(`
      INSERT INTO announcements (${names.join(', ')})
      SELECT ${names.join(', ')} FROM jsonb_populate_record(NULL::announcements, $1::jsonb)
    `).run(JSON.stringify(row));
  }

  for (const { photos, name, eventDate } of site.albums) {
    if (await db.prepare('SELECT 1 FROM albums WHERE name = $1').get(name)) continue;
    const { id } = await db.prepare(`
      INSERT INTO albums (name, event_date) VALUES ($1, COALESCE($2::date, (now() AT TIME ZONE 'Asia/Taipei')::date)) RETURNING id
    `).get(name, eventDate ?? null);
    for (const photo of photos) {
      await storage.saveImage(await imageFile(site, photo.path), (storedName, filename) => db.prepare(`
        INSERT INTO photos (stored_name, alt, album_id, filename) VALUES ($1, $2, $3, $4)
      `).run(storedName, photo.alt, id, filename));
    }
  }
}
