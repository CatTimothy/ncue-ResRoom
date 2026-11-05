import { computed, reactive, ref, useTemplateRef } from 'vue';

/** 編輯表單共用的狀態。dialog 與 show 只有 ref="dialog" 的 EditorDialog 才用得到 */
export function useEditor(initial) {
  const dialog = useTemplateRef('dialog');
  const form = reactive({ ...initial });
  const saved = ref(JSON.stringify(form));
  const loading = ref(false);
  const loadFailed = ref(false);
  const busy = ref(false);
  const error = ref('');

  const snapshot = () => JSON.stringify(form);
  const changed = computed(() => !loading.value && snapshot() !== saved.value);

  /** 填入欄位，並視為尚未修改 */
  function reset(values) {
    Object.assign(form, values);
    saved.value = snapshot();
  }

  /** 目前的內容已儲存，之後換頁不用再確認 */
  const markSaved = () => reset({});

  function show(values) {
    reset(values);
    error.value = '';
    dialog.value.open();
  }

  /** 開啟後才載入的內容 */
  async function load(request) {
    loading.value = true;
    try {
      await request();
    } catch (failure) {
      loadFailed.value = true;
      error.value = failure.message;
    } finally {
      loading.value = false;
    }
  }

  /** 送出；失敗時留在視窗內顯示原因。成功後要不要關閉由 action 決定 */
  async function run(action) {
    busy.value = true;
    error.value = '';
    try {
      await action();
    } catch (failure) {
      error.value = failure.message;
    } finally {
      busy.value = false;
    }
  }

  return { dialog, form, changed, loading, loadFailed, busy, error, reset, markSaved, show, load, run };
}
