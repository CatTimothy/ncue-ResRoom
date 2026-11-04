import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const { server } = await createApp({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.DATA_DIR || './data',
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  production: process.env.NODE_ENV === 'production',
  allowedOrigins: (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
});

const port = Number(process.env.PORT) || 4000;
server.listen(port, () => console.log(`網站：http://localhost:${port}/，GraphQL API：http://localhost:${port}/graphql`));
