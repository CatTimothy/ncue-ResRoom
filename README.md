# NCUE 資源教室 GraphQL API

提供 pages、announcements、photos、documents 四種內容。需要 Node.js 24 以上與 PostgreSQL 13 以上。

## 啟動

```sh
npm install
cp .env.example .env               # 填入 DATABASE_URL，資料庫需先建立
npm run create-user -- admin       # 建立第一位使用者；忘記密碼時也用它重設
npm run dev                        # http://localhost:4000/graphql
npm test                           # 需要 TEST_DATABASE_URL，帳號要有建立資料庫的權限
```

上傳檔案在 `DATA_DIR`（預設 `./data`），其他資料在 PostgreSQL，兩者都要備份。

## 前端

`web/` 是 Vue 公開網站，頁面架構依原站：資源教室簡介、服務項目、最新消息、成員介紹、法令規章、活動剪影、位置圖、文件下載、聯絡我們。先啟動 API，再執行：

```sh
cd web
npm install
npm run dev                        # http://localhost:5173，/graphql 與 /files 會轉到 API
npm test
npm run build                      # 輸出到根目錄的 public/，API 會直接提供
```

API 不在 `http://localhost:4000` 時，啟動前請設定 `API_URL`。

第一次使用時，執行 `npm run seed-content` 匯入原站的頁面內容和文件（`seed/`）。可重複執行，不會覆蓋已存在的內容。

上線時先在 `web/` 執行 `npm run build`，再於根目錄執行 `npm start`，網站和 API 都在同一個網址（`PORT`，預設 4000）。放在反向代理後方時，要保留原始 `Host` 標頭。`public/` 每次建置都會被清空重建，不要放自己的檔案。

相簿名稱寫成 `110(1)校外參訪活動` 時，會拆成學期標記和活動名稱。公告可設定發布時間，時間未到時只有登入後才看得到。相簿則有活動日期，「活動剪影」依活動日期由新到舊排列，並在相簿名稱下方直接顯示照片；沒有照片的相簿不會公開列出。不過已經知道網址的相簿和照片檔案仍可直接開啟。

公告清單的日期只顯示月日（例如 11月5日），年份標在每一年的開頭，左側的線條連起同一年的公告。公告的欄位對應學校公告系統（`saveAnnouncement` 更新時沒帶到的欄位不變）：公告標題、公告單位、瀏覽人次、公告日期（即發布時間）、截止日期、聯絡人、分機、詳細內容。截止日期只用於顯示，過期不會隱藏。瀏覽人次不計入登入後的瀏覽。Markdown 內容的單一換行會保留，貼上學校公告時不用另外調整分行。

內文中獨立成段的圖片（`![說明](網址)`）會用相簿的方式顯示，可以點開放大；相鄰的圖片合併成一組，只有一張時不裁切；和文字寫在同一段的圖片維持原樣。照片說明即圖片語法中的文字，預設為檔名。

頁尾的今日訪問人數以台灣時區計算，同一個瀏覽器一天只算一次（記在 `localStorage`），不需登入即可記錄，所以只適合當作參考數字。

最新消息和活動剪影的搜尋列，比對公告標題與發布日期（台灣時區），或相簿名稱與活動日期，例如 `115/11/4`、`2026-11`、`11/4`、`3月`。

### 本地快取

快取只為了瀏覽順暢，不做長期保存：

- 各頁的文字內容與照片清單存在 `sessionStorage`：關閉分頁就清除，最多保留 1 小時，單筆超過 256 KB 不存。開頁時先顯示快取，再到背景向 API 更新。
- 登入後新增、編輯或刪除內容時，會清除快取並重新取得目前頁面的內容。其他分頁或其他人的畫面會在下次開頁時更新。
- 照片的壓縮版由瀏覽器依 `Cache-Control` 快取 1 小時，所以已刪除的照片在看過的瀏覽器裡最多還會留 1 小時。原始檔和文件不快取。
- 修改快取資料的格式時，請更新 `web/src/cache.js` 的版本號。

### 管理內容

按頁首右上角的「登入」後，公告、相簿、照片、文件和頁面都會出現新增、編輯、刪除按鈕。公告和頁面按編輯後，會在原頁面直接切換成編輯模式（網址加上 `?edit=1`，新增時是 `?new=1`）；相簿、照片和文件則用視窗編輯。上傳照片時每張都有自己的說明，預設為檔名。日期一律以民國輸入，例如 `115/11/04 15:20`。頁面的總覽在「所有頁面」（`/pages`），新增的頁面網址是 `/pages/<網址>`，並自動加入主選單。帳號用 `npm run create-user -- <username>` 建立。

公告和頁面使用 Markdown 編輯器（md-editor-v3，只在管理員開啟時下載）。工具列的「新增圖片」、把圖片拖進內容區或貼上，都會自動上傳並插入圖片語法。沒有任何公告或頁面引用、且超過 1 天的圖片，會在下次上傳內文圖片時清除。

照片可以一次選擇多張，共用同一個說明；說明會自動加上編號，上傳後可逐張修改。照片依序逐張上傳，某張失敗不影響其他張，失敗的照片會留在視窗內，可直接重試。

## 資料庫

- 不使用 ORM。所有查詢都是 `db.prepare('... $1 ...').get / all / run(...)`，以具名的伺服器端 prepared statement 執行。
- 資料表與欄位值的限制（`CHECK`）都在 `src/db/schema.sql`。新增約束時，請到 `src/db/errors.js` 加上錯誤訊息。
- `schema.sql` 只會建立不存在的物件；上線後要改結構，需另外寫 `ALTER TABLE`，並確保可重複執行（可參考其中 `announcements` 的升級區塊）。

## 登入

查詢公開內容不需登入；編輯操作、未發布的公告、沒有照片的相簿和頁面的 `source` 都需要對應的權限。每個帳號可以勾選多項權限：

| 權限 | 可以做的事 |
|---|---|
| `MANAGE_ANNOUNCEMENTS` | 新增、編輯、刪除公告 |
| `MANAGE_ALBUMS` | 管理相簿與照片 |
| `MANAGE_DOCUMENTS` | 管理文件 |
| `MANAGE_PAGES` | 管理頁面 |
| `MANAGE_SITE_CONFIG` | 編輯頁尾 |
| `MANAGE_USERS` | 查看帳號清單、新增帳號、變更其他帳號的權限 |

內文圖片的上傳需要 `MANAGE_ANNOUNCEMENTS` 或 `MANAGE_PAGES`。沒有權限時，畫面上不會顯示對應的按鈕，伺服器也會拒絕操作（錯誤代碼 `FORBIDDEN`）。

每個人都可以按頁首的「帳號設定」更改自己的密碼；有 `MANAGE_USERS` 的人還會在同一個視窗看到帳號管理。

要新增權限時，依 `src/lib/permissions.js` 開頭的步驟修改。

```graphql
mutation { login(username: "admin", password: "...") { username } }
query { me { username permissions } }
mutation { logout }
mutation { changePassword(currentPassword: "...", newPassword: "...") }

# 需要 MANAGE_USERS
query { users { username permissions } }
mutation { createUser(username: "editor", password: "...", permissions: [MANAGE_ANNOUNCEMENTS, MANAGE_PAGES]) { username permissions } }
mutation { setUserPermissions(username: "editor", permissions: [MANAGE_ALBUMS]) { username permissions } }
```

第一位使用者要用 `npm run create-user -- <username>` 建立。忘記密碼時也用這個指令重設，既有帳號的權限不變；用指令新增的帳號有全部權限。

- 更改密碼後，同一帳號的所有裝置都會被登出，只有目前的裝置會換一個新的登入狀態。
- 權限變更會立即在伺服器生效，不需要重新登入；對方畫面上的按鈕要重新整理頁面才會更新。
- 不能變更自己的權限，所以至少會留下一位可以管理帳號的人。

- 登入狀態存在 7 天有效的 HttpOnly cookie，前端發送請求時要帶 `credentials: 'include'`。
- 同一來源對同一帳號 15 分鐘內嘗試超過 10 次就會暫時鎖定。
- `NODE_ENV=production` 時 cookie 只透過 HTTPS 傳送，並關閉 GraphiQL。
- 前端與 API 網址不同時要設定 `CORS_ORIGINS`，且兩者要在同一個網域底下。放在反向代理後方時，要保留原始 `Host` 標頭，否則請把網站網址加入 `CORS_ORIGINS`。

## 公告

欄位只有 `id`、`title`、`content`、`created_at`、`modified_at`、`published_at`；編輯時會更新 `modified_at`，`published_at` 可自訂。`content` 只支援 Markdown，內嵌 HTML 不會顯示。圖片的寫法：

```markdown
![合照](https://example.com/photo.jpg)
```

```graphql
mutation { saveAnnouncement(title: "標題", content: "**內容**") { id html createdAt modifiedAt } }
```

前端顯示時請用 `html` 欄位，它已轉換並消毒。

相簿用 `saveAlbum(id, name, eventDate)`、`deleteAlbum(id)` 管理，刪除時照片和檔案會一起刪除。照片用 `uploadPhoto(file, alt, albumId)`、`updatePhoto(id, alt, albumId)`、`deletePhoto(id)` 管理。

照片依檔案內容判斷格式，接受 JPEG、PNG、GIF、WebP、AVIF、TIFF；副檔名不影響判斷。HEIC 需先轉檔。

照片會保存原始檔，並另外產生網頁顯示用的壓縮版（WebP，長邊最多 1600 像素，去除 EXIF）。`url` 是壓縮版；`originalUrl` 是原始檔，一律以下載方式提供。原始檔存在 `DATA_DIR/uploads`，壓縮版存在 `DATA_DIR/display`，後者不需備份，缺少時會自動重新產生。

上傳時整個檔案會先讀進伺服器記憶體，所以實際可上傳的大小取決於伺服器的記憶體，反向代理也要放寬請求大小與逾時限制。

## 頁面

用 `slug` 新增或覆蓋頁面。內容可直接傳入 HTML 或 Markdown：

```graphql
mutation {
  savePage(slug: "about", title: "資源教室簡介", format: HTML, content: "<h2>簡介</h2>") { slug html }
}
```

也可以上傳 `.md` 或 `.html` 檔案，格式依副檔名判斷：

```sh
# login.json 與 operations.json 都請存成 UTF-8
# login.json：
# {"query":"mutation { login(username: \"admin\", password: \"...\") { username } }"}
# operations.json：
# {"query":"mutation ($file: File!) { savePage(slug: \"about\", title: \"簡介\", file: $file) { html } }","variables":{"file":null}}
curl http://localhost:4000/graphql -c cookies.txt -H "Content-Type: application/json" -d @login.json
curl http://localhost:4000/graphql -b cookies.txt -F "operations=<operations.json" -F map='{"0":["variables.file"]}' -F 0=@about.md
```

在 Windows 上，直接把中文寫在 curl 參數裡會變成亂碼，所以請像上面一樣從檔案讀取。

前端顯示時請用 `html` 欄位。頁面會移除 `<script>`、`<style>`、`style` 屬性與事件屬性；`<iframe>` 僅允許 YouTube 和 `www.google.com`（地圖）。

## 上傳限制

| 類型 | 格式 | 上限 |
|---|---|---|
| 頁面、公告內容 | 頁面可上傳 `.md`、`.markdown`、`.html`、`.htm` | 2 MB |
| 照片、內文圖片 | JPEG、PNG、GIF、WebP、AVIF、TIFF（檢查檔案內容），照片的 `alt` 必填 | 不限 |
| 文件 | pdf、doc(x)、odt、xls(x)、ods、ppt(x)、odp、txt | 20 MB |

檔案網址是相對路徑（`/files/...`），前端與 API 網址不同時要自行加上 API 網址。

## 專案結構

```text
src/
├─ server.js          # 啟動入口
├─ app.js             # 組合各元件並分派 HTTP 請求
├─ db/                # schema.sql、連線與 prepare、約束錯誤訊息
├─ graphql/
│  ├─ index.js        # 合併各功能的 schema、Yoga 設定
│  ├─ auth.js         # 登入與使用者
│  ├─ pages.js
│  ├─ announcements.js
│  ├─ photos.js
│  └─ documents.js
├─ http/              # 檔案下載、請求前置檢查
├─ lib/               # 登入狀態、密碼、權限檢查、錯誤、內容消毒、檔案儲存
└─ scripts/           # create-user
```

`src/graphql/` 的每個檔案都包含該功能的 GraphQL schema 和 resolver。新增功能後，要在 `src/graphql/index.js` 註冊。
