import { ref } from 'vue';
import { cache } from './cache.js';

/** 目前登入的使用者；null 表示未登入 */
export const currentUser = ref(null);
/** 內容或登入狀態改變時遞增，畫面上的內容會跟著重新取得 */
export const contentVersion = ref(0);
/** 操作結果的提示文字 */
export const notice = ref('');

let noticeTimer = null;

function showNotice(message) {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = '';
  }, 4000);
}

/** 內容已修改：清除快取並通知畫面 */
function publish(message) {
  cache.clear();
  contentVersion.value++;
  if (message) showNotice(message);
}

function signedOut() {
  currentUser.value = null;
  publish();
}

function sessionExpired() {
  signedOut();
  return Object.assign(new Error('登入已過期，請重新登入。'), { expired: true });
}

async function send(init) {
  let response;
  try {
    response = await fetch('/graphql', { method: 'POST', ...init });
  } catch {
    throw new Error('無法連線到伺服器，請檢查網路後再試一次。');
  }
  if (response.status === 401) throw sessionExpired();
  if (response.status === 413) throw new Error('內容太大，請縮短後再試一次。');
  if (!response.ok) throw new Error(`伺服器發生錯誤（${response.status}），請稍後再試一次。`);
  const { data, errors } = await response.json();
  if (errors?.[0].extensions?.code === 'UNAUTHENTICATED') throw sessionExpired();
  if (errors?.length) throw new Error(errors[0].message);
  return Object.values(data)[0]; // 每個請求都只查詢一個欄位
}

function query(text, variables) {
  return send({
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: text, variables }),
  });
}

/** 上傳單一檔案；variables 不含 file */
function sendFile(text, variables, file) {
  const body = new FormData();
  body.append('operations', JSON.stringify({ query: text, variables: { ...variables, file: null } }));
  body.append('map', JSON.stringify({ 0: ['variables.file'] }));
  body.append('0', file);
  return send({ body });
}

async function changed(request, message) {
  const result = await request;
  publish(message);
  return result;
}

const mutate = (text, variables, message) => changed(query(text, variables), message);

/** 依 id 刪除的 mutation */
const deleter = (name, message) => (id) => mutate(`mutation ($id: ID!) { ${name}(id: $id) }`, { id }, message);

/** 可搜尋的清單查詢 */
const searchList = (field, fields) => (limit, offset = 0, search = null) => query(
  `query ($search: String, $limit: Int, $offset: Int) {
    ${field}(search: $search, limit: $limit, offset: $offset) { ${fields} }
  }`,
  { search, limit, offset },
);

// 公告
const ANNOUNCEMENT_FIELDS = 'id title createdAt modifiedAt publishedAt';
const announcementWith = (extra) => (id) => query(
  `query ($id: ID!) { announcement(id: $id) { ${ANNOUNCEMENT_FIELDS} ${extra} } }`,
  { id },
);

export const fetchAnnouncements = searchList('announcements', ANNOUNCEMENT_FIELDS);
const ANNOUNCEMENT_INFO = 'unit deadline contactPerson extension';
export const fetchAnnouncement = announcementWith(`html ${ANNOUNCEMENT_INFO}`);
/** 編輯時才需要 Markdown 原文 */
export const fetchAnnouncementSource = announcementWith(`content ${ANNOUNCEMENT_INFO}`);

export const saveAnnouncement = ({ id = null, title, content, publishedAt, unit, deadline, contactPerson, extension }) => mutate(
  `mutation ($id: ID, $title: String!, $content: String!, $publishedAt: String, $unit: String, $deadline: String, $contactPerson: String, $extension: String) {
    saveAnnouncement(id: $id, title: $title, content: $content, publishedAt: $publishedAt, unit: $unit, deadline: $deadline, contactPerson: $contactPerson, extension: $extension) { id }
  }`,
  { id, title, content, publishedAt, unit, deadline, contactPerson, extension },
  id ? '公告已儲存' : '公告已新增',
);

export const deleteAnnouncement = deleter('deleteAnnouncement', '公告已刪除');

/** 不算內容修改，所以不清除快取；回傳目前的瀏覽人次 */
export const recordAnnouncementView = (id) => query('mutation ($id: ID!) { recordAnnouncementView(id: $id) }', { id });

// 訪問人數
export const fetchTodayVisits = () => query('{ todayVisits }');
export const recordVisit = () => query('mutation { recordVisit }');

// 內文圖片
export const uploadContentImage = (file) => sendFile(
  'mutation ($file: File!) { uploadContentImage(file: $file) { url name } }',
  {},
  file,
);

// 相簿
const ALBUM_FIELDS = 'id name createdAt modifiedAt eventDate photoCount coverUrl';

export const fetchAlbums = searchList('albums', ALBUM_FIELDS);
export const fetchAlbum = (id) => query(`query ($id: ID!) { album(id: $id) { ${ALBUM_FIELDS} } }`, { id });

export const saveAlbum = ({ id = null, name, eventDate }) => mutate(
  `mutation ($id: ID, $name: String!, $eventDate: String) {
    saveAlbum(id: $id, name: $name, eventDate: $eventDate) { id }
  }`,
  { id, name, eventDate },
  id ? '相簿已儲存' : '相簿已新增',
);

export const deleteAlbum = deleter('deleteAlbum', '相簿已刪除');

// 照片
export const fetchPhotos = (albumId, limit, offset = 0) => query(
  `query ($albumId: ID!, $limit: Int, $offset: Int) {
    photos(albumId: $albumId, limit: $limit, offset: $offset) { id albumId url originalUrl alt }
  }`,
  { albumId, limit, offset },
);

/**
 * 依序上傳多張照片，一張失敗不影響其他張。每張都有自己的說明（item.alt）。
 * 清單由新到舊顯示，所以倒序送出，顯示時才會是選擇的順序。
 * 回傳 { uploaded, failed: [{ item, message }], remaining }；登入過期時會中止。
 */
export async function uploadPhotos(items, albumId, { onProgress = () => {}, shouldStop = () => false } = {}) {
  const pending = [...items].reverse();
  const failed = [];
  let uploaded = 0;
  let sent = 0;

  try {
    while (pending.length && !shouldStop()) {
      const item = pending.shift();
      onProgress(++sent);
      try {
        await sendFile(
          'mutation ($file: File!, $alt: String!, $albumId: ID!) { uploadPhoto(file: $file, alt: $alt, albumId: $albumId) { id } }',
          { alt: item.alt, albumId },
          item.file,
        );
        uploaded++;
      } catch (error) {
        if (error.expired) throw error; // 後面的也不用試了
        failed.unshift({ item, message: error.message });
      }
    }
  } finally {
    if (uploaded) publish(uploaded > 1 ? `已上傳 ${uploaded} 張照片` : '照片已上傳');
  }
  return { uploaded, failed, remaining: pending.reverse() };
}

export const updatePhoto = ({ id, alt, albumId }) => mutate(
  `mutation ($id: ID!, $alt: String!, $albumId: ID!) {
    updatePhoto(id: $id, alt: $alt, albumId: $albumId) { id }
  }`,
  { id, alt, albumId },
  '照片已儲存',
);

export const deletePhoto = deleter('deletePhoto', '照片已刪除');

// 頁面
export const fetchPages = () => query('{ pages { slug title } }');
export const fetchPage = (slug) => query('query ($slug: String!) { page(slug: $slug) { slug title html } }', { slug });
export const fetchPageSource = (slug) => query('query ($slug: String!) { page(slug: $slug) { title source } }', { slug });

export const savePage = ({ slug, title, content }) => mutate(
  `mutation ($slug: String!, $title: String!, $content: String!) {
    savePage(slug: $slug, title: $title, format: MARKDOWN, content: $content) { slug }
  }`,
  { slug, title, content },
  '頁面已儲存',
);

export const deletePage = (slug) => mutate('mutation ($slug: String!) { deletePage(slug: $slug) }', { slug }, '頁面已刪除');

// 文件
export const fetchDocuments = (limit, offset = 0) => query(
  `query ($limit: Int, $offset: Int) {
    documents(limit: $limit, offset: $offset) { id title category url filename size }
  }`,
  { limit, offset },
);

export const uploadDocument = ({ file, title, category }) => changed(
  sendFile(
    'mutation ($file: File!, $title: String!, $category: String) { uploadDocument(file: $file, title: $title, category: $category) { id } }',
    { title, category },
    file,
  ),
  '文件已上傳',
);

export const updateDocument = ({ id, title, category }) => mutate(
  'mutation ($id: ID!, $title: String!, $category: String) { updateDocument(id: $id, title: $title, category: $category) { id } }',
  { id, title, category },
  '文件已儲存',
);

export const deleteDocument = deleter('deleteDocument', '文件已刪除');

// 登入
export async function loadCurrentUser() {
  try {
    currentUser.value = await query('{ me { username } }');
    if (currentUser.value) publish(); // 登入後才看得到未發布的內容
  } catch (error) {
    console.error(error);
  }
}

export async function login(username, password) {
  currentUser.value = await query(
    `mutation ($username: String!, $password: String!) {
      login(username: $username, password: $password) { username }
    }`,
    { username, password },
  );
  publish('已登入');
}

export async function logout() {
  await query('mutation { logout }');
  signedOut();
  showNotice('已登出');
}
