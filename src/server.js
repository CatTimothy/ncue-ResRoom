import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

// 啟動時的檢查（資料庫、上傳資料夾的權限）失敗就直接結束，不要等到使用時才出錯
const { server } = await createApp({
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

const port = Number(process.env.PORT) || 4000;
server.listen(port, () => console.log(`網站：http://localhost:${port}/，GraphQL API：http://localhost:${port}/graphql`));
