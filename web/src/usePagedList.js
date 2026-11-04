import { ref, watch } from 'vue';
import { contentVersion } from './api.js';
import { cache } from './cache.js';

const API_PAGE_LIMIT = 100;

/**
 * 分頁清單：先立即顯示本地快取，再到背景向 API 更新；getKey() 的值改變時換成新清單。
 * 快取會記住已載入的筆數，回到頁面時內容長度不變，捲動位置才能還原。
 * getKey() 回傳快取鍵；fetchPage(limit, offset) 回傳一頁資料。
 */
export function usePagedList(getKey, fetchPage, size) {
  const items = ref([]);
  const hasMore = ref(false);
  const busy = ref(false); // 使用者正在等待：沒有內容可顯示，或按了載入更多
  const failed = ref(false);
  const savedAt = ref(null);
  let request = 0;
  let retryAction = null;

  /** API 單次最多回傳 100 筆，超過時分次取得 */
  async function fetchRange(count, start = 0) {
    const rows = [];
    while (rows.length < count) {
      const limit = Math.min(API_PAGE_LIMIT, count - rows.length);
      const page = await fetchPage(limit, start + rows.length);
      rows.push(...page);
      if (page.length < limit) break;
    }
    return rows;
  }

  function store(key) {
    cache.write(key, { items: items.value, hasMore: hasMore.value });
    savedAt.value = Date.now();
  }

  async function run(action, load, apply) {
    const current = ++request;
    const key = getKey();
    retryAction = action;
    failed.value = false;
    try {
      const rows = await load();
      if (current !== request) return; // 已有較新的請求，例如切換了相簿
      apply(rows);
      store(key);
    } catch (error) {
      if (current !== request) return;
      console.error(error);
      failed.value = true;
    } finally {
      if (current === request) busy.value = false;
    }
  }

  function refresh() {
    const count = Math.max(items.value.length, size);
    busy.value = items.value.length === 0;
    return run(refresh, () => fetchRange(count + 1), (rows) => {
      items.value = rows.slice(0, count);
      hasMore.value = rows.length > count;
    });
  }

  function more() {
    busy.value = true;
    const start = items.value.length;
    return run(more, () => fetchRange(size + 1, start), (rows) => {
      items.value = [...items.value, ...rows.slice(0, size)];
      hasMore.value = rows.length > size;
    });
  }

  function open() {
    const entry = cache.read(getKey());
    items.value = entry?.data.items ?? [];
    hasMore.value = entry?.data.hasMore ?? false;
    savedAt.value = entry?.time ?? null;
    return refresh();
  }

  open();
  watch(getKey, open);
  watch(contentVersion, refresh);

  return { items, hasMore, busy, failed, savedAt, more, retry: () => retryAction?.() };
}
