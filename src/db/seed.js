import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { writeNavigation } from '../graphql/navigation.js';
import { snakeizeKeys } from './index.js';

const PAGES = [
  ['about', '資源教室簡介'],
  ['services', '服務項目'],
  ['members', '成員介紹'],
  ['regulations', '法令規章'],
  ['map', '位置圖'],
];
const DOCUMENT_CATEGORY = '111學年度第一學期';

/** 網站原本的頁首選單；選單裡還沒有任何頁面時才套用 */
const NAVIGATION = {
  utility: [{ service: 'HOME' }, { page: 'map' }, { service: 'DOCUMENTS' }],
  main: [
    { page: 'about' }, { page: 'services' }, { service: 'ANNOUNCEMENTS' },
    { page: 'members' }, { page: 'regulations' }, { service: 'PHOTOS' },
  ],
};

/**
 * 套用 seed/site-config.json 的網站設定：文字只寫入還是資料庫預設值（示範內容）的欄位，
 * 圖片只在還沒設定（使用內建示範圖片）時上傳。已經修改過的設定不會被覆蓋
 */
export async function seedSiteConfig({ db, storage, seedDir }) {
  const { images = {}, ...settings } = JSON.parse(await readFile(join(seedDir, 'site-config.json'), 'utf8'));

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
    const bytes = await readFile(join(seedDir, 'branding', name));
    patch[field] = (await storage.saveContentImage(new File([bytes], name))).url;
  }
  if (!Object.keys(patch).length) return;

  const row = snakeizeKeys(patch);
  const names = Object.keys(row);
  await db.prepare(`
    UPDATE site_config c SET ${names.map((name) => `${name} = r.${name}`).join(', ')}
    FROM jsonb_populate_record(NULL::site_config, $1::jsonb) AS r
  `).run(JSON.stringify(row));
}

/** 匯入初始內容；可重複執行，已存在的頁面與同名文件不會被覆蓋，已放了頁面的頁首選單與修改過的網站設定也不會 */
export async function seedContent({ db, storage, seedDir }) {
  await seedSiteConfig({ db, storage, seedDir });

  for (const [slug, title] of PAGES) {
    if (await db.prepare('SELECT 1 FROM pages WHERE slug = $1').get(slug)) continue;

    let source = await readFile(join(seedDir, 'pages', `${slug}.md`), 'utf8');
    for (const [placeholder, name] of [...source.matchAll(/\{\{image:([^}]+)\}\}/g)]) {
      const bytes = await readFile(join(seedDir, 'images', name));
      const { url } = await storage.saveContentImage(new File([bytes], name));
      source = source.replace(placeholder, url);
    }
    await db.prepare("INSERT INTO pages (slug, title, format, source) VALUES ($1, $2, 'MARKDOWN', $3)").run(slug, title, source);
  }

  if (!(await db.prepare('SELECT 1 FROM navigation_links WHERE page_slug IS NOT NULL').get())) {
    await writeNavigation(db, NAVIGATION);
  }

  const documentsDir = join(seedDir, 'documents');
  // 新到舊顯示，所以倒序匯入才會符合檔名順序
  for (const name of (await readdir(documentsDir)).sort().reverse()) {
    const title = basename(name, extname(name));
    if (await db.prepare('SELECT 1 FROM documents WHERE title = $1').get(title)) continue;
    const bytes = await readFile(join(documentsDir, name));
    await storage.save(bytes, extname(name).toLowerCase(), (storedName) => db.prepare(`
      INSERT INTO documents (stored_name, title, category, filename, size) VALUES ($1, $2, $3, $4, $5)
    `).run(storedName, title, DOCUMENT_CATEGORY, name, bytes.length));
  }
}
