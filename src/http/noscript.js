// 沒有 JavaScript 時看到的頁面（也用來產生 SEO 資訊，見 src/http/seo.js）：伺服器預先用靜態網站的樣板（src/static-site）產生每個公開網址的 HTML，
// 提供 index.html 時放進 <noscript>（見 src/http/static.js）。有 JavaScript 的瀏覽器會忽略 <noscript>，畫面不受影響。
//
// 什麼時候重新產生：
// - 啟動時
// - 內容改變後：GraphQL 的 mutation（見 src/graphql/index.js）與匯入網站資料都會呼叫 invalidate()，
//   等 1 秒沒有新的修改才重建，連續修改只重建一次
// - 預約發布的公告到了發布時間
// - 每小時一次，涵蓋直接修改資料庫等其他情況
import { renderNoscriptPages } from '../static-site/index.js';

const DEBOUNCE = 1000;
const REFRESH_INTERVAL = 60 * 60 * 1000;

export function createNoscriptPages({ db, storage }) {
  let current = null; // { pages: Map(網址 → { title, body }), theme, nextChange }
  let building = null;
  let again = false;
  let debounceTimer = null;
  let refreshTimer = null;
  let stopped = false;

  function scheduleRefresh(nextChange) {
    clearTimeout(refreshTimer);
    if (stopped) return;
    const untilChange = nextChange ? nextChange.getTime() - Date.now() + 1000 : Infinity;
    refreshTimer = setTimeout(refresh, Math.max(1000, Math.min(untilChange, REFRESH_INTERVAL)));
    refreshTimer.unref();
  }

  /** 重新產生；正在產生時，結束後再產生一次，才不會漏掉產生途中的修改 */
  function refresh() {
    if (building) {
      again = true;
      return building;
    }
    building = (async () => {
      try {
        do {
          again = false;
          current = await renderNoscriptPages({ db, storage });
        } while (again && !stopped);
      } catch (error) {
        if (!stopped) console.error('無法產生沒有 JavaScript 時的頁面：', error);
      } finally {
        building = null;
        scheduleRefresh(current?.nextChange);
      }
    })();
    return building;
  }

  return {
    refresh,

    /** 內容改變了：稍等一下再重建 */
    invalidate() {
      if (stopped) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, DEBOUNCE);
      debounceTimer.unref();
    },

    /** 這個網址的頁面（不是公開頁面時是 null）、網站資訊與預設主題；還沒產生過時等它產生 */
    async get(pathname) {
      if (!current) await refresh();
      if (!current) return null;
      return { page: current.pages.get(pathname) ?? null, site: current.site, theme: current.theme };
    },

    /** 整份結果（sitemap、llms.txt 用，見 src/http/seo.js） */
    async snapshot() {
      if (!current) await refresh();
      return current;
    },

    stop() {
      stopped = true;
      clearTimeout(debounceTimer);
      clearTimeout(refreshTimer);
    },
  };
}
