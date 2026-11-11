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

上傳檔案在 `DATA_DIR`（預設 `./data`），其他資料在 PostgreSQL，兩者都要備份。也可以在網站設定頁輸出整個網站的資料（見「網站資料的輸出與匯入」），但帳號不包含在內。啟動時會檢查 `DATA_DIR` 底下的 `uploads`、`display` 能否寫入，沒有權限就直接結束並說明原因。

## 前端

`web/` 是 Vue 公開網站，頁面架構依原站：資源教室簡介、服務項目、最新消息、成員介紹、法令規章、活動剪影、位置圖、文件下載。先啟動 API，再執行：

```sh
cd web
npm install
npm run dev                        # http://localhost:5173，/graphql 與 /files 會轉到 API
npm test
npm run build                      # 輸出到根目錄的 public/，API 會直接提供
```

API 不在 `http://localhost:4000` 時，啟動前請設定 `API_URL`。

網站內建的網站設定與圖片（`web/public` 的標誌、網站圖示、主視覺）是通用的示範內容（DEMO SCHOOL）。第一次使用時，執行 `npm run seed-content` 匯入彰化師範大學資源教室的頁面內容、文件和網站設定（`seed/`，網站設定與圖片在 `seed/site-config.json` 和 `seed/branding/`），並把這些頁面排進頁首選單（選單裡還沒有任何頁面時才會）。`seed/` 和「輸出網站資料」的 ZIP 是同一種格式（見「網站資料的輸出與匯入」）。網站設定只會寫入還是示範預設值的欄位、圖片只在還沒上傳時設定，已經修改過的不會被覆蓋。要給其他學校使用時，修改或移除 `seed/` 即可。可重複執行，不會覆蓋已存在的內容。沒有匯入時，頁首選單只有首頁、最新消息和活動剪影。

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

按頁首右上角的「登入」會在目前的頁面上開啟登入視窗（舊的 `/login` 網址會回到首頁並開啟視窗），登入後留在原本的頁面。登入後，公告、相簿、照片、文件和頁面都會出現新增、編輯、刪除按鈕。公告和頁面按編輯後，會在原頁面直接切換成編輯模式（網址加上 `?edit=1`，新增時是 `?new=1`）；相簿、照片和文件則用視窗編輯。上傳照片時每張都有自己的說明，預設為檔名；之後在燈箱點說明文字就能直接修改。公告和頁面內文的圖片也一樣（需要該內容的權限），修改時會改寫內文裡的圖片語法；用 HTML 寫的頁面要到編輯畫面改。日期一律以民國輸入，例如 `115/11/04 15:20`。頁面的總覽在「所有頁面」（`/pages`），最上方是頁首選單（需要 `MANAGE_SITE_CONFIG`），下方列出網站功能（首頁、最新消息、活動剪影、文件下載）與所有頁面。有 `MANAGE_PAGES` 權限時，頁首會出現「新增頁面」按鈕。頁面網址的輸入框寫 `test` 會放在 `/pages/test`，開頭加上 `/`（例如 `/test`）會直接放在網站第一層（`pages.root`）；放在第一層時不能用 `announcements`、`photos`、`documents`、`pages`、`settings` 等網站已經用掉的網址（`web/src/navigation.js` 的 `RESERVED_SLUGS`）。編輯頁面時也可以修改網址，頁首選單會跟著改，但其他內容裡連到舊網址的連結不會改。新增的頁面會自動加到主選單的最後，不想放在選單上時，到頁首選單拖到「未加入」。頁面會記錄建立時間（`created_at`）與最後修改時間。有 `MANAGE_SITE_CONFIG` 權限時，頁首會出現「網站設定」（`/settings`，頁尾的「編輯頁尾」也連到這裡），可以修改：網站標題（瀏覽器分頁的標題）、標誌、網站圖示（favicon）、標誌旁的名稱、首頁的標題與主視覺圖片、頁尾的聯絡資訊（標題、電話、分機、開放時間、聯絡老師），以及主題。頁首選單（連結可以是頁面或首頁、最新消息、活動剪影、文件下載，存在 `navigation_links` 資料表）在「所有頁面」編輯。圖片透過 `uploadContentImage` 上傳，按「使用內建圖片」會改回 `web/public` 裡的圖片。Copyright 固定為 CatTimothy（寫在 `web/src/components/SiteFooter.vue`），年份和今日訪問人數由系統產生。帳號用 `npm run create-user -- <username>` 建立。

公告和頁面使用 Markdown 編輯器（md-editor-v3，只在管理員開啟時下載）；頁面也可以在編輯畫面改選 HTML，改用純文字的輸入框（切換格式不會轉換已輸入的內容）。工具列的「新增圖片」、把圖片拖進內容區或貼上，都會自動上傳並插入圖片語法。有 `MANAGE_DOCUMENTS` 權限時，工具列還有「新增文件」，也可以把文件拖進內容區（拖曳時游標會標示插入的位置）：文件會透過 `uploadDocument` 上傳並插入下載連結，同時列在「文件下載」頁；在該頁刪除文件後，內容裡的連結會失效。沒有任何公告、頁面或網站設定引用（`schema.sql` 的 `image_references`）、且超過 1 天的圖片，會在下次上傳內文圖片時清除。

### 網站資料的輸出與匯入

網站設定頁最下方的「網站資料」可以把整個網站輸出成一個 ZIP 檔，或匯入這樣的檔案，用來備份、直接修改後再匯入，或搬到另一個網站。需要帳號管理以外的所有權限（`src/lib/permissions.js` 的 `SITE_DATA_PERMISSIONS`），因為輸出包含未發布的內容，匯入會取代所有內容。也可以直接呼叫：`GET /site-data` 下載，`POST /site-data`（請求內容就是 ZIP 檔本身）匯入，都要帶登入的 cookie。

ZIP 裡的資料夾結構和專案的 `seed/` 一樣（程式在 `src/site-files/`），所以把 `seed/` 壓縮成 ZIP 也能直接匯入；整包放在一個資料夾裡壓縮也可以，匯入時會去掉最外層：

```text
site-config.json            網站設定，欄位名稱同 GraphQL；"images": { "logoUrl": "logo.webp" } 指向 branding/ 裡的圖片
navigation.json             頁首選單 { "utility": [{ "service": "HOME" }, { "page": "map" }], "main": [...] }
visits.json                 每日訪問人數
pages/<slug>.md 或 .html     頁面；開頭的 front matter 寫 title、path（/about 在第一層，沒寫或 /pages/about 在 /pages 底下）、createdAt
announcements/<名稱>.md      公告；front matter 寫 title、publishedAt、unit、deadline、contactPerson、extension 等
albums/<資料夾>/             一本相簿；album.json 寫 name、eventDate 和每張照片的說明（沒寫的用檔名）
documents/<分類>/<檔名>      文件；資料夾就是分類，標題預設是檔名。documents.json 可以另外寫標題與分類
images/                     內文圖片，內文寫成 {{image:map.png}}；連到文件寫成 {{document:分類/檔名.pdf}}
branding/                   標誌、網站圖示、主視覺
```

front matter 的寫法如下，值可以是 JSON 或直接寫文字：

```markdown
---
title: 資源教室簡介
---

內文……
```

- 帳號、密碼與登入狀態不包含在內。
- 匯入時先把圖片與文件寫進上傳資料夾，再用 `schema.sql` 的 `import_site()` 一次取代資料庫裡的資料；任何一步失敗，網站都維持原狀。成功後，原本的照片與文件檔案會被刪除。公告與相簿寫了 `id` 時沿用，網址不會改變。
- 瀏覽器會先讀出 ZIP 的檔案清單，顯示各類內容的數量，請管理員確認後才上傳（`web/src/siteData.js`、`web/src/zipIndex.js`）。上傳的 ZIP 會先存成暫存檔，所以要有足夠的磁碟空間；反向代理也要放寬請求大小與逾時限制。
- `npm run seed-content` 讀的也是這個格式，但只會補上沒有的內容，不會取代。
- 新增資料表或欄位時，輸出在 `src/site-files/export.js`、匯入在 `src/site-files/import.js`、讀取在 `src/site-files/read.js`；資料表也要加在 `schema.sql` 的 `site_data_tables()`。

### 靜態網站

網站設定頁的「下載靜態網站」（`GET /static-site`，需要 `MANAGE_SITE_CONFIG`）把目前公開的內容輸出成 HTML 檔並打包成 ZIP：首頁、最新消息與每則公告、活動剪影與每本相簿、文件下載、所有頁面，以及它們用到的照片（壓縮版）、文件、樣式與字型。每個網址是一個資料夾裡的 `index.html`，連結都是相對路徑，解壓縮後放到任何網頁伺服器就能瀏覽。

- 未發布的公告與沒有照片的相簿不包含在內；沒有登入、搜尋和瀏覽人次，公告的瀏覽人次是輸出當時的數字。主題切換、窄螢幕選單與照片燈箱由 `src/static-site/assets/site.js` 提供。
- 樣板在 `src/static-site/index.js`，樣式直接用 `web/` 建置出來的 CSS，所以要先在 `web/` 執行 `npm run build`。修改 `web/` 的版面時，這裡對應的樣板也要一起改。

### 沒有 JavaScript 時

關閉 JavaScript 的訪客也能瀏覽公開內容。伺服器提供 `index.html` 時（`src/http/static.js`），會把這個網址的頁面（頁首、選單、內容、頁尾）放進 `<noscript>`，並換上這一頁的標題；有 JavaScript 的瀏覽器會忽略 `<noscript>`，畫面不受影響。

- 頁面用的是靜態網站的樣板（`src/static-site/index.js`，連結是網站原本的網址），所以內容和「下載靜態網站」一樣：已發布的公告、有照片的相簿、文件與所有頁面。沒有主題切換、燈箱、登入與編輯；點照片會直接開啟圖片，窄螢幕時選單直接展開；顏色用網站設定的淺色主題。不是公開頁面的網址（例如 `/settings`）會顯示需要開啟 JavaScript。
- 所有頁面預先產生並放在記憶體裡（`src/http/noscript.js`），開頁時不用查資料庫。重新產生的時機：啟動時；會改變內容的 GraphQL mutation 與匯入網站資料之後（等 1 秒沒有新的修改才重建）；預約發布的公告到了發布時間；以及每小時一次（涵蓋直接修改資料庫等情況）。登入、瀏覽人次等不影響內容的 mutation 不會觸發，所以公告的瀏覽人次可能不是最新的。
- 新增不會改變公開內容的 mutation 時，加到 `src/graphql/index.js` 的 `NON_CONTENT_MUTATIONS`。

### 主題

網站有淺色和深色兩種主題。訪客可按頁首右上角的月亮／太陽圖示切換，選擇記在 `localStorage`；沒有選擇時用網站設定的預設主題（可設成依訪客裝置的設定）。網站設定可以修改兩種主題各自的背景、卡片與輸入框、文字、連結與重點、頁首與標記五種顏色，只會保存和內建顏色不同的部分。內建顏色寫在 `web/src/style.css` 開頭，其他顏色（次要文字、線條等）由這五種算出來。

照片可以一次選擇多張，共用同一個說明；說明會自動加上編號，上傳後可逐張修改。照片依序逐張上傳，某張失敗不影響其他張，失敗的照片會留在視窗內，可直接重試。

文件也可以一次選擇多份，標題直接用去掉副檔名的檔名。檔名開頭寫學年和學期時（例如 `115(1)伴讀申請表.pdf`），分類會是「115學年度第一學期」、標題是「伴讀申請表」；沒有寫的列在「其他文件」。視窗裡的「分類」欄位有填時會套用到這次上傳的所有文件，蓋過檔名的學期。手動輸入的分類寫成 `115(1)` 或 `115-1` 也會改成「115學年度第一學期」。已上傳的文件可以再修改標題和分類。在「文件下載」頁，每份文件前面都有勾選框，分類標題旁可以「全選此分類」；勾選後畫面上方會出現工具列，可以一次變更分類（`setDocumentsCategory(ids, category)`，留空移到「其他文件」）或刪除（`deleteDocuments(ids)`）。

## 資料庫

- 不使用 ORM。所有查詢都是 `db.prepare('... $1 ...').get / all / run(...)`，以具名的伺服器端 prepared statement 執行。
- 資料驗證盡量交給資料庫：欄位值的限制（`CHECK`）都在 `src/db/schema.sql`，多個資料表共用的限制寫成型別（`title_text`、`content_text`、`image_path`、`theme_colors`）。新增約束時，請到 `src/db/errors.js` 加上錯誤訊息；型別的約束名稱是「型別名稱_check」。
- 文字欄位頭尾的空白與換行由 `trim_columns` 觸發程序（`trim_text`）去除，查詢不用自己處理。要去除空白的欄位列在 `schema.sql` 最後的區塊；內文不要列進去（Markdown 的縮排有意義）。
- 欄位用 snake_case，查詢結果會自動轉成 camelCase，和 GraphQL 的欄位名稱一致。
- `schema.sql` 只會建立不存在的物件；上線後要改結構，需另外寫 `ALTER TABLE`，並確保可重複執行（可參考其中 `announcements` 的升級區塊）。

## 登入

查詢公開內容不需登入；編輯操作、未發布的公告、沒有照片的相簿和頁面的 `source` 都需要對應的權限。每個帳號可以勾選多項權限：

| 權限 | 可以做的事 |
|---|---|
| `MANAGE_ANNOUNCEMENTS` | 新增、編輯、刪除公告 |
| `MANAGE_ALBUMS` | 管理相簿與照片 |
| `MANAGE_DOCUMENTS` | 管理文件 |
| `MANAGE_PAGES` | 管理頁面 |
| `MANAGE_SITE_CONFIG` | 網站設定（標題、圖片、首頁文字、頁尾、主題） |
| `MANAGE_USERS` | 查看帳號清單、新增帳號、變更其他帳號的權限 |

內文圖片的上傳需要 `MANAGE_ANNOUNCEMENTS`、`MANAGE_PAGES` 或 `MANAGE_SITE_CONFIG`。沒有權限時，畫面上不會顯示對應的按鈕，伺服器也會拒絕操作（錯誤代碼 `FORBIDDEN`）。

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
├─ http/              # 檔案下載、網站資料的輸出與匯入、靜態網站下載、請求前置檢查
├─ site-files/        # 網站資料的資料夾格式（和 seed/ 相同）：讀取、輸出、匯入
├─ static-site/       # 靜態網站的樣板與前端程式
├─ lib/               # 登入狀態、密碼、權限檢查、錯誤、內容消毒、檔案儲存
└─ scripts/           # create-user
```

`src/graphql/` 的每個檔案都包含該功能的 GraphQL schema 和 resolver。新增功能後，要在 `src/graphql/index.js` 註冊。
