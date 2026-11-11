/** 在選單上有固定位置的頁面，網址是 /<slug>（見 router.js） */
export const BUILT_IN_PAGES = {
  about: '資源教室簡介',
  services: '服務項目',
  members: '成員介紹',
  regulations: '法令規章',
  map: '位置圖',
};

/** 頁首選單上的固定連結：路徑與名稱，也是這些頁面的標題。自訂頁面的路徑是 /pages/<slug> */
export const NAV_LINKS = {
  '/': '首頁',
  '/documents': '文件下載',
  '/announcements': '最新消息',
  '/photos': '活動剪影',
  ...Object.fromEntries(Object.entries(BUILT_IN_PAGES).map(([slug, title]) => [`/${slug}`, title])),
};

/** 網站設定還沒載入時用的排列，和資料庫的預設值一樣（test/api.test.js 會比對） */
export const DEFAULT_NAVIGATION = {
  utility: ['/', '/map', '/documents'],
  main: ['/about', '/services', '/announcements', '/members', '/regulations', '/photos'],
};

/**
 * 把儲存的排列換成兩列連結 { utility: [{ to, label }], main: [...] }。
 * 已刪除的頁面拿掉；沒有排過的連結（例如新增的頁面）依序接在主選單後面
 */
export function navMenus(navigation, customPages = []) {
  const labels = new Map(Object.entries(NAV_LINKS));
  // 內建頁面（例如 about）已有固定的連結，不再以 /pages/about 出現一次
  for (const page of customPages) {
    if (!(page.slug in BUILT_IN_PAGES)) labels.set(`/pages/${page.slug}`, page.title);
  }

  const placed = new Set();
  const row = (paths) => paths.filter((to) => labels.has(to) && !placed.has(to) && placed.add(to));
  const utility = row(navigation?.utility ?? DEFAULT_NAVIGATION.utility);
  const main = row(navigation?.main ?? DEFAULT_NAVIGATION.main);
  main.push(...row([...labels.keys()]));

  const links = (paths) => paths.map((to) => ({ to, label: labels.get(to) }));
  return { utility: links(utility), main: links(main) };
}

/** navMenus 的結果換回可以儲存的路徑 */
export const navPaths = (menus) => ({
  utility: menus.utility.map((link) => link.to),
  main: menus.main.map((link) => link.to),
});

/** 把 path 移到 to 那一列的第 index 個位置，回傳新的排列 */
export function moveNavLink(navigation, path, to, index) {
  const result = {
    utility: navigation.utility.filter((item) => item !== path),
    main: navigation.main.filter((item) => item !== path),
  };
  result[to].splice(Math.max(0, Math.min(index, result[to].length)), 0, path);
  return result;
}
