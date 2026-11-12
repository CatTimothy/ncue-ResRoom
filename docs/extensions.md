# 擴充功能開發說明

擴充功能是有自己網址的網站功能，例如最新消息（`/announcements`）、活動剪影（`/photos`）、文件下載（`/documents`）。這三個是隨系統提供的**系統擴充功能**，其他功能可以照同樣的方式加進來。

管理員在帳號選單的「擴充功能」（`/extensions`，需要 `MANAGE_SITE_CONFIG`）可以停用或啟用每個擴充功能。

## 快速開始

```sh
npm run extensions:new -- event-signup --label 活動報名 --description 線上報名校內活動。
npm run build      # 重新建置網站
npm run dev        # 重新啟動伺服器
```

`extensions:new` 會建立一個可以直接執行的擴充功能：網址 `/event-signup`、一個 GraphQL 範例欄位、一個頁面，以及沒有 JavaScript 時的頁面。接著依需求修改這些檔案即可。

新的擴充功能附帶一項權限（`MANAGE_EVENT_SIGNUP`）。既有帳號不會自動得到新權限，要由管理員在「帳號管理」勾選。

## 檔案結構

每個擴充功能分成網站與伺服器兩個資料夾，資料夾名稱相同：

```text
web/src/extensions/
├─ meta.js                 # 自動產生：所有擴充功能的基本資料
├─ index.js                # 自動產生：網站部分的清單
└─ event-signup/
   ├─ meta.js              # 基本資料（伺服器也讀這個檔）
   ├─ index.js             # 網址與首頁區塊
   └─ EventSignupPage.vue  # 畫面，可以有多個
src/extensions/
├─ index.js                # 自動產生：伺服器部分的清單
├─ state.js                # 啟用狀態（不要修改）
└─ event-signup/
   ├─ index.js             # GraphQL 與靜態頁面的設定
   ├─ graphql.js           # schema 與 resolver
   └─ static.js            # 沒有 JavaScript 時的頁面與靜態網站
```

### 自動產生的清單

`web/src/extensions/meta.js`、`web/src/extensions/index.js`、`src/extensions/index.js` 由 `npm run extensions:sync` 依資料夾產生，不要手動修改。以下指令會先自動執行它：

- 根目錄的 `npm run dev`、`npm test`、`npm run build`
- `web/` 的 `npm run dev`、`npm run build`

所以新增或刪除資料夾後，通常不需要另外執行。產生前會檢查：

- 兩邊的資料夾都在（只有一邊時會列出缺少的檔案）
- 資料夾名稱只有小寫英文、數字與連字號
- `key`、`path`、權限沒有重複，也沒有和核心功能衝突（核心功能的網址與權限在 `web/src/reservedPaths.js`）

`npm run extensions:sync -- --check` 只檢查清單是否最新，不寫入；適合放在 CI。

## meta.js：基本資料

```js
export default {
  key: 'EVENT_SIGNUP',
  label: '活動報名',
  description: '線上報名校內活動。',
  path: '/event-signup',
  order: 40,
  system: false,
  permissions: { MANAGE_EVENT_SIGNUP: '活動報名' },
};
```

| 欄位 | 說明 |
| --- | --- |
| `key` | 英文大寫、數字與底線。也是頁首選單的 `NavService` 值與資料庫 `extensions` 資料表的鍵，建立後不要再改 |
| `label` | 名稱，顯示在選單、頁面標題與「擴充功能」頁 |
| `description` | 一句話的說明，顯示在「擴充功能」頁 |
| `path` | 第一層網址。放在第一層的頁面不能使用這個網址 |
| `order` | 數字，由小到大決定首頁區塊、權限清單的順序。系統擴充功能是 10、20、30 |
| `system` | 隨系統提供的才是 `true`。只有系統擴充功能的權限是輸出、匯入網站資料的必要權限 |
| `permissions` | `{ 權限: 顯示名稱 }`，會自動加進權限清單（GraphQL 的 `Permission` 列舉、帳號管理的勾選項目）。不需要時寫 `{}` |

這個檔案伺服器（Node.js）也會讀，所以只能是純資料，不能引用 `.vue` 或 `vue` 等只有網站才有的套件。

## 網站部分：web/src/extensions/&lt;名稱&gt;/index.js

```js
import HomeSection from './HomeSection.vue';
import meta from './meta.js';
import EventList from './EventList.vue';
import EventPage from './EventPage.vue';

export default {
  ...meta,
  routes: [
    { path: meta.path, component: EventList },
    { path: `${meta.path}/:id`, component: EventPage, props: true },
  ],
  home: HomeSection, // 選填
};
```

- `routes` 是 vue-router 的路由，網址要在 `meta.path` 底下。頁面標題預設是 `label`，可以用 `meta: { title }` 改。
- `home`（選填）是首頁的區塊元件，依 `order` 排在主視覺下方。參考 `announcements/HomeSection.vue`。
- 停用時，網址會顯示「找不到這個頁面」，選單連結與首頁區塊也會隱藏。

畫面可以用網站共用的程式：

| 來源 | 用途 |
| --- | --- |
| `../../api.js` 的 `query(查詢, 變數)` | 送出 GraphQL 查詢，回傳唯一一個欄位的值 |
| `../../api.js` 的 `mutate(查詢, 變數, 提示文字)` | 會改變內容的請求：完成後清除快取、更新畫面並顯示提示 |
| `../../api.js` 的 `can(權限)` | 目前的帳號有沒有這項權限，決定要不要顯示管理按鈕 |
| `../../siteConfig.js` 的 `isExtensionEnabled(key)` | 其他擴充功能是否啟用 |
| `../../useCachedItem.js`、`../../usePagedList.js` | 有本地快取的單筆內容、可以載入更多的清單 |
| `../../components/` | `EditorForm`、`EditorDialog`、`ListStatus`、`RichTextEditor`（文字編輯器）等元件 |

樣式寫在 `web/src/style.css`，沿用 `page`、`stop`、`document-list` 等既有的 class，深色模式才會一致。

## 伺服器部分：src/extensions/&lt;名稱&gt;/index.js

```js
import meta from '../../../web/src/extensions/event-signup/meta.js';
import { createEventSignupResolvers, eventSignupTypeDefs } from './graphql.js';
import staticSite from './static.js';

export default {
  ...meta,
  typeDefs: [eventSignupTypeDefs],
  createResolvers: [createEventSignupResolvers],
  passiveMutations: ['recordEventView'],
  staticSite,
};
```

| 欄位 | 說明 |
| --- | --- |
| `typeDefs` | GraphQL schema 字串的陣列，用 `extend type Query`、`extend type Mutation` 加欄位 |
| `createResolvers` | 函式的陣列，收到 `{ db, storage, sessions }`，回傳 resolver |
| `passiveMutations`（選填） | 不會改變公開內容的 mutation 名稱，例如計算瀏覽人次。其他 mutation 執行後會重新產生沒有 JavaScript 時的頁面 |
| `staticSite`（選填） | 沒有 JavaScript 時的頁面與靜態網站，見下一節 |

### GraphQL

```js
import { fail } from '../../lib/errors.js';
import { hasPermission, withPermission } from '../../lib/guards.js';

export const eventSignupTypeDefs = /* GraphQL */ `
  type Event { id: ID! title: String! }
  extend type Query { events: [Event!]! }
  extend type Mutation { deleteEvent(id: ID!): Boolean! }
`;

export function createEventSignupResolvers({ db }) {
  return {
    Query: {
      events: () => db.prepare('SELECT * FROM events ORDER BY id DESC').all(),
    },
    Mutation: withPermission('MANAGE_EVENT_SIGNUP', {
      async deleteEvent(_, { id }) {
        const { changes } = await db.prepare('DELETE FROM events WHERE id = $1').run(id);
        return changes > 0;
      },
    }),
  };
}
```

- 擴充功能停用時，它的 `Query` 與 `Mutation` 欄位會自動回傳錯誤碼 `EXTENSION_DISABLED`，不用自己檢查。
- `db.prepare(sql)` 的 `get`、`all`、`run` 用 `$1`、`$2` 帶參數；欄位名稱會轉成 camelCase。
- 輸入錯誤用 `fail('訊息')`；權限用 `withPermission`，或在 resolver 裡用 `requirePermission(context, 權限)`。

### 沒有 JavaScript 時的頁面與靜態網站（static.js）

伺服器會預先產生每個公開網址的 HTML，放在 `<noscript>` 裡給搜尋引擎與沒有 JavaScript 的訪客，也用在「下載靜態網站」、`sitemap.xml` 與 `llms.txt`。擴充功能提供：

```js
import { emptyStatus, html, latest, listMeta, page } from '../../static-site/template.js';

export default {
  /** 讀出公開的資料；回傳值會傳給下面的函式。nextChange（選填）是下一次公開內容會改變的時間 */
  async load({ db, storage }) {
    const events = await db.prepare('SELECT * FROM events ORDER BY id DESC').all();
    return { events, nextChange: null };
  },

  /** 這個擴充功能的所有頁面，每頁是 page() 加上 meta */
  pages: (site, { events }) => [{
    ...page('/event-signup', '活動報名', (u) => html`
      <div class="page">
        <h1 class="stop">活動報名</h1>
        ${events.map((item) => html`<p><a href="${u.to(`/event-signup/${item.id}`)}">${item.title}</a></p>`)}
        ${!events.length && emptyStatus('目前沒有活動。')}
      </div>`),
    meta: listMeta('活動報名', `${site.config.siteTitle}的活動報名。`, latest(events.map((e) => e.modifiedAt))),
  }],

  home: ({ events }) => (u) => html`<section>…</section>`,   // 選填：首頁區塊
  homeModified: ({ events }) => events.map((e) => e.modifiedAt), // 選填：算進首頁的最後修改時間
  info: ({ events }) => ({}),                                    // 選填：加進 llms.txt 用的網站資訊
};
```

`src/static-site/template.js` 提供的工具：

| 名稱 | 用途 |
| --- | --- |
| `` html`…` `` | HTML 樣板，`${}` 的值一律跳脫；已經是 HTML 的用 `raw()` 包起來 |
| `page(網址, 標題, (u) => 內容, { lightbox })` | 一頁的定義。`u.to(網址)` 產生頁面連結，`u.local(網址)` 產生檔案連結（靜態網站會換成相對路徑） |
| `listMeta`、`HOME_CRUMB` | 清單頁的 meta、麵包屑的首頁 |
| `articleBody`、`emptyStatus` | 消毒過的內文、「目前沒有…」 |
| `textOf`、`excerpt`、`firstImage`、`latest` | 取純文字、描述、第一張圖、最新的日期 |

meta 的欄位（`description`、`image`、`type`、`published`、`modified`、`breadcrumb`、`text`）見 `src/static-site/index.js` 的說明。版面要和 Vue 的畫面一致，修改其中一邊時另一邊也要改。

## 資料表

資料表目前寫在 `src/db/schema.sql`。這個檔案每次啟動都會執行，所以要寫成可以重複執行的語句（`CREATE TABLE IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS`）。

- 要放進「輸出與匯入網站資料」時，加到 `site_data_tables()`，並在 `src/site-files/` 的 `export.js`、`read.js`、`import.js` 處理檔案格式。
- 會放圖片網址的文字欄位，要加進 `image_references` view，否則圖片會被當成沒人用而清除。
- 要去除頭尾空白的文字欄位，加進檔案最後的觸發程序清單。

停用擴充功能不會刪除資料；重新啟用後一切恢復。

## 停用與啟用的行為

| | 停用時 |
| --- | --- |
| 網址 | 顯示「找不到這個頁面」 |
| 頁首選單 | 隱藏；在「所有頁面」儲存選單時位置保留，重新啟用後回到原處（已經不在選單上的，啟用時加到主選單最後） |
| 首頁 | 不顯示它的區塊 |
| API | `Query`、`Mutation` 欄位回傳 `EXTENSION_DISABLED` |
| 沒有 JavaScript 時的頁面、靜態網站、sitemap、llms.txt | 不包含它的頁面 |
| 資料 | 保留 |
| 網站資料的輸出 | `extensions.json` 記錄啟用狀態，匯入時一併還原 |

## 移除擴充功能

1. 刪除 `web/src/extensions/<名稱>/` 與 `src/extensions/<名稱>/`
2. 重新建置並重新啟動（會自動更新清單）

資料庫裡的資料表、`extensions` 資料表的記錄與選單連結不會刪除；選單不會顯示已移除的功能。不再需要資料表時，再自行從 `schema.sql` 移除並刪除資料表。

## 測試

- 伺服器：`test/api.test.js` 用 `start()` 建立獨立的資料庫，可以呼叫 GraphQL 並檢查 `noscript.get(網址)` 的頁面。
- 網站：`web/src/*.test.js` 用 `node --test` 執行，只能測試不依賴瀏覽器的程式。

目前的測試假設只有三個系統擴充功能（權限清單、擴充功能清單）；新增擴充功能後，記得一起更新這些測試。
