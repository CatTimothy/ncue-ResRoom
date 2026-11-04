import { ref, watch } from 'vue';
import { contentVersion } from './api.js';
import { cache } from './cache.js';
import { setTitle } from './page.js';

/**
 * 單筆內容：先立即顯示本地快取，再到背景向 API 更新；getKey() 的值改變時換成新內容。
 * fetcher() 回傳資料，不存在時回傳 null。titleOf(資料) 回傳頁面標題，不需要時可省略。
 * status：loading、ready、missing、failed。stale 表示顯示的是更新失敗前的快取。
 */
export function useCachedItem(getKey, fetcher, titleOf = null) {
  const item = ref(null);
  const savedAt = ref(null);
  const status = ref('loading');
  const stale = ref(false);
  let request = 0;

  async function refresh() {
    const current = ++request;
    const key = getKey();
    stale.value = false;
    if (!item.value) status.value = 'loading';
    try {
      const row = await fetcher();
      if (current !== request) return;
      item.value = row;
      if (row) {
        cache.write(key, row);
        savedAt.value = Date.now();
        status.value = 'ready';
      } else {
        // 內容已被刪除，本地的副本也要一起移除
        cache.remove(key);
        status.value = 'missing';
      }
    } catch (error) {
      if (current !== request) return;
      console.error(error);
      if (item.value) stale.value = true;
      else status.value = 'failed';
    }
  }

  function open() {
    const entry = cache.read(getKey());
    item.value = entry?.data ?? null;
    savedAt.value = entry?.time ?? null;
    status.value = entry ? 'ready' : 'loading';
    return refresh();
  }

  open();
  watch(getKey, open);
  watch(contentVersion, refresh);
  if (titleOf) {
    watch(item, (row) => {
      if (row) setTitle(titleOf(row));
    }, { immediate: true });
  }

  return { item, savedAt, status, stale, refresh };
}
