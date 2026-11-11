/** 常用頁面的預設標題：頁面還沒建立時顯示 */
export const BUILT_IN_PAGES = {
  about: '資源教室簡介',
  services: '服務項目',
  members: '成員介紹',
  regulations: '法令規章',
  map: '位置圖',
};

/** 頁首選單可以連到的網站功能，對應 API 的 NavService；名稱也是這些頁面的標題 */
export const SERVICES = {
  HOME: { to: '/', label: '首頁' },
  ANNOUNCEMENTS: { to: '/announcements', label: '最新消息' },
  PHOTOS: { to: '/photos', label: '活動剪影' },
  DOCUMENTS: { to: '/documents', label: '文件下載' },
};

/** 選單還沒載入時用的排列，和資料庫建立時的內容一樣（test/api.test.js 會比對）；頁面由 seed-content 加入 */
export const DEFAULT_NAVIGATION = {
  utility: [{ service: 'HOME', page: null }],
  main: [{ service: 'ANNOUNCEMENTS', page: null }, { service: 'PHOTOS', page: null }],
};

/** 網站已經用掉的第一層網址，頁面不能用這些 slug（伺服器的 savePage 也會檢查） */
export const RESERVED_SLUGS = [
  'announcements', 'photos', 'documents', 'pages', 'settings', 'login',
  'files', 'assets', 'graphql', 'site-data', 'static-site',
];

/** 頁面的網址：/<slug>；舊的 /pages/<slug> 會轉過來 */
export const pagePath = (slug) => `/${slug}`;

/** 對選單的兩列各自套用 fn */
export const mapMenus = (navigation, fn) => ({ utility: navigation.utility.map(fn), main: navigation.main.map(fn) });

/** API 的連結 { service, page } 換成畫面用的 { key, to, label }；key 是功能名稱或 page:<slug> */
export const menuLink = ({ service, page }) => (service
  ? { key: service, ...SERVICES[service] }
  : { key: `page:${page.slug}`, to: pagePath(page.slug), label: page.title });

/** key 換回 saveNavigation 的輸入 */
export const linkInput = (key) => (key.startsWith('page:') ? { page: key.slice('page:'.length) } : { service: key });

/** API 的選單換成 { utility: [key], main: [key] }，網站設定編輯的就是這個 */
export const navigationKeys = (navigation) => mapMenus(navigation, (link) => menuLink(link).key);

/** 所有可以放進選單的連結：網站功能與每個頁面（pages 是 { slug, title }），key → 連結 */
export const allLinks = (pages) => new Map(
  [...Object.keys(SERVICES).map((service) => ({ service })), ...pages.map((page) => ({ page }))]
    .map(menuLink)
    .map((link) => [link.key, link]),
);

/** 編輯畫面的三列：兩列選單，加上還沒放進選單的連結。找不到的 key（例如已刪除的頁面）與重複的拿掉 */
export function editorRows(keys, links) {
  const used = new Set();
  const row = (list) => list.filter((key) => links.has(key) && !used.has(key) && used.add(key)).map((key) => links.get(key));
  const utility = row(keys.utility);
  const main = row(keys.main);
  return { utility, main, unused: [...links.values()].filter((link) => !used.has(link.key)) };
}

/** 把 key 移到 to 那一列的第 index 個位置，回傳新的 { utility, main }；to 不是這兩列（例如「未加入」）時就是從選單移除 */
export function moveLink(keys, key, to, index) {
  const result = {
    utility: keys.utility.filter((item) => item !== key),
    main: keys.main.filter((item) => item !== key),
  };
  result[to]?.splice(Math.max(0, Math.min(index, result[to].length)), 0, key);
  return result;
}
