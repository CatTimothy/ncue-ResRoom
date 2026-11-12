// 匯入頁面與文件的初始內容：npm run seed-content。可重複執行，不會覆蓋已存在的內容
import { fileURLToPath } from 'node:url';
import { openDb } from '../db/index.js';
import { seedContent } from '../db/seed.js';
import { createStorage } from '../lib/storage.js';

const db = await openDb(process.env.DATABASE_URL);
try {
  const storage = createStorage({ db, dataDir: process.env.DATA_DIR || './data' });
  await seedContent({ db, storage, seedDir: fileURLToPath(new URL('../../seed', import.meta.url)) });
  console.log('初始內容已匯入');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
