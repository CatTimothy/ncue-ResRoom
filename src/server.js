import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { DEFAULT_USER, ensureDefaultUser } from './lib/password.js';

// 啟動時的檢查（資料庫、上傳資料夾的權限）失敗就直接結束，不要等到使用時才出錯
const { server, db } = await createApp({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR || './data',
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  production: process.env.NODE_ENV === 'production',
  siteUrl: process.env.SITE_URL || null,
  allowedOrigins: (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
}).catch((error) => {
  console.error(`無法啟動：${error.message}`);
  process.exit(1);
});

// 還沒有任何使用者時建立預設帳號；密碼是公開的，沒有更改前每次啟動都提醒
const defaultUser = await ensureDefaultUser(db);
if (defaultUser === 'created') console.warn(`已建立預設帳號 ${DEFAULT_USER.username}，密碼是 ${DEFAULT_USER.password}。請立刻登入並在「帳號設定」更改密碼。`);
if (defaultUser === 'unchanged') console.warn(`警告：帳號 ${DEFAULT_USER.username} 還在使用預設密碼，請立刻登入並在「帳號設定」更改密碼。`);

const port = Number(process.env.PORT) || 4000;
server.listen(port, () => console.log(`網站：http://localhost:${port}/，GraphQL API：http://localhost:${port}/graphql`));
