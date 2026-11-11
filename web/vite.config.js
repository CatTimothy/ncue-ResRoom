import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const target = process.env.API_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [vue()],
  // 字型不要內嵌進 CSS，否則每個訪客都要先下載用不到的字型資料
  // 建置結果由 API 提供，見 src/http/static.js
  build: { assetsInlineLimit: 0, outDir: '../public', emptyOutDir: true },
  server: {
    // 要寫成物件：字串寫法會改寫 Host，而 API 比對 Origin 與 Host，POST 會得到 403
    proxy: {
      '/graphql': { target },
      '/files': { target },
      '/site-data': { target },
    },
  },
});
