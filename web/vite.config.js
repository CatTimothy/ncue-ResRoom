import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const target = process.env.API_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [vue()],
  // 字型不要內嵌進 CSS，否則每個訪客都要先下載用不到的字型資料
  // 建置結果由 API 提供，見 src/http/static.js
  build: {
    assetsInlineLimit: 0,
    outDir: '../public',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // 文字編輯器（只有管理員開啟時才下載）拆成幾個共用的檔案，每個都不超過 500 kB，更新網站時沒變的部分可以沿用快取
        codeSplitting: {
          // 只拆出符合的套件本身；預設會連它用到的 Vue 一起搬進去，變成每頁都要先下載
          includeDependenciesRecursively: false,
          groups: [
            { name: 'prosemirror', test: /node_modules[\\/](prosemirror-[^\\/]+|orderedmap|rope-sequence|w3c-keyname)[\\/]/ },
            { name: 'tiptap', test: /node_modules[\\/](@tiptap[\\/](?!markdown)|linkifyjs)[\\/]?/ },
            { name: 'markdown', test: /node_modules[\\/](@tiptap[\\/]markdown|marked)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    // 要寫成物件：字串寫法會改寫 Host，而 API 比對 Origin 與 Host，POST 會得到 403
    proxy: {
      '/graphql': { target },
      '/files': { target },
      '/site-data': { target },
      '/static-site': { target },
    },
  },
});
