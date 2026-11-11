// 內容的短期快取，只為了換頁與回上一頁時順暢：關閉分頁就清除，最多保留 1 小時。
// 只存公開內容與登入後才看得到的未發布內容；登入狀態改變時 api.js 會清除。修改資料格式時請更新版本號。
const NAMESPACE = 'resroom:';
const PREFIX = `${NAMESPACE}v9:`;
const MAX_AGE = 60 * 60 * 1000;
const MAX_ENTRY_LENGTH = 256 * 1024;

function removeAll(store) {
  Array.from({ length: store.length }, (_, i) => store.key(i))
    .filter((key) => key?.startsWith(NAMESPACE))
    .forEach((key) => store.removeItem(key));
}

/** 快取失敗不能影響網站：儲存空間被封鎖、資料毀損時都視為沒有快取 */
export function createCache(getStorage, now = Date.now) {
  function safely(action) {
    try {
      return action(getStorage());
    } catch {
      return null;
    }
  }

  return {
    /** 回傳 { data, time }；沒有或已過期時回傳 null */
    read: (key) => safely((store) => {
      const raw = store.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (now() - entry.time <= MAX_AGE) return entry;
      store.removeItem(PREFIX + key);
      return null;
    }),

    write: (key, data) => safely((store) => {
      const value = JSON.stringify({ time: now(), data });
      if (value.length > MAX_ENTRY_LENGTH) {
        store.removeItem(PREFIX + key); // 舊的副本已過時，不能留著
        return;
      }
      try {
        store.setItem(PREFIX + key, value);
      } catch {
        removeAll(store); // 空間不足：這只是快取，全部清掉再存
        store.setItem(PREFIX + key, value);
      }
    }),

    remove: (key) => safely((store) => store.removeItem(PREFIX + key)),
    clear: () => safely(removeAll),
  };
}

export const cache = createCache(() => globalThis.sessionStorage);

/** 同一本相簿的照片清單，相簿清單與單本相簿頁共用 */
export const albumPhotosKey = (id) => `album:${id}:photos`;
