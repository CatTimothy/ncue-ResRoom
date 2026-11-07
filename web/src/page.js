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
