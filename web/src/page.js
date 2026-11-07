import { ref } from 'vue';

/** 目前頁面的名稱；分頁標題「頁面名稱｜網站標題」由 siteConfig.js 組合 */
export const pageName = ref('');

export function setTitle(name) {
  pageName.value = name ?? '';
}

/** 把焦點移到內容開頭：換頁或原本的按鈕消失時，鍵盤與螢幕報讀軟體使用者才不會迷路 */
export function focusMain() {
  document.getElementById('main')?.focus({ preventScroll: true });
}

export async function confirmDelete(question, action, after = focusMain) {
  if (!window.confirm(`${question}刪除後無法復原。`)) return;
  try {
    await action();
    after();
  } catch (error) {
    window.alert(error.message);
  }
}
