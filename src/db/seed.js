import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const PAGES = [
  ['about', '資源教室簡介'],
  ['services', '服務項目'],
  ['members', '成員介紹'],
  ['regulations', '法令規章'],
  ['map', '位置圖'],
];
const DOCUMENT_CATEGORY = '111學年度第一學期';

/** 匯入初始內容；可重複執行，已存在的頁面與同名文件不會被覆蓋 */
export async function seedContent({ db, storage, seedDir }) {
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
