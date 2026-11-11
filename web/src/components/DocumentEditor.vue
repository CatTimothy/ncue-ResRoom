<script setup>
import { computed, ref } from 'vue';
import { setDocumentsCategory, updateDocument, uploadDocuments } from '../api.js';
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_TITLE_LENGTH, normalizeCategory, parseDocumentName } from '../format.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

const emit = defineEmits(['batchSaved']);

const { dialog, form, changed, busy, error, show, run } = useEditor({ title: '', category: '' });
const items = ref([]); // 待上傳的文件：{ key, file, title, category, error }
const fileInputKey = ref(0);
const id = ref(null);
const batchIds = ref([]); // 多選後一起變更分類的文件
/** upload：上傳新文件；edit：編輯一份；batch：多份一起變更分類 */
const mode = computed(() => (batchIds.value.length ? 'batch' : id.value ? 'edit' : 'upload'));
const dirty = computed(() => items.value.length > 0 || changed.value);

/** 有填「分類」欄位時套用到所有文件；沒填時用檔名開頭的學期 */
const categoryOf = (item) => normalizeCategory(form.category) ?? item.category;

/** 傳入 item 時編輯；不傳時上傳新文件 */
function open(item = null) {
  id.value = item?.id ?? null;
  batchIds.value = [];
  items.value = [];
  fileInputKey.value++;
  show({ title: item?.title ?? '', category: item?.category ?? '' });
}

function onFiles(event) {
  // 標題與分類都由檔名決定：「115(1)申請表.pdf」→ 分類「115學年度第一學期」、標題「申請表」
  items.value = [...event.target.files].map((file, key) => ({ key, file, ...parseDocumentName(file.name), error: '' }));
  error.value = '';
}

async function upload() {
  // 清單由新到舊顯示，所以倒序送出，顯示時才會是選擇的順序
  const pending = [...items.value].reverse();
  const results = await uploadDocuments(pending.map((item) => ({ file: item.file, title: item.title, category: categoryOf(item) })));
  const left = pending
    .map((item, index) => ({ ...item, error: results[index]?.status === 'rejected' ? results[index].reason.message : '' }))
    .filter((item, index) => results[index]?.status !== 'fulfilled')
    .reverse();
  if (!left.length) {
    items.value = [];
    dialog.value.close();
    return;
  }

  // 留下還沒傳成功的文件，可以直接重試；已傳成功的不會重複上傳
  items.value = left;
  fileInputKey.value++;
  const uploaded = results.filter((result) => result.status === 'fulfilled').length;
  error.value = `已上傳 ${uploaded} 份，還有 ${left.length} 份沒有上傳。可以重新上傳，或按取消放棄。`;
}

const submit = () => run(async () => {
  if (batchIds.value.length) {
    await setDocumentsCategory(batchIds.value, normalizeCategory(form.category));
    dialog.value.close();
    emit('batchSaved');
    return;
  }
  if (!id.value) {
    await upload();
    return;
  }
  await updateDocument({ id: id.value, title: form.title, category: normalizeCategory(form.category) });
  dialog.value.close();
});

/** 一次變更多份文件的分類；留空表示移到「其他文件」 */
function openCategory(ids) {
  id.value = null;
  batchIds.value = [...ids];
  items.value = [];
  show({ title: '', category: '' });
}

defineExpose({ open, openCategory });
</script>

<template>
  <EditorDialog
    ref="dialog"
    :title="{ upload: '新增文件', edit: '編輯文件', batch: `變更 ${batchIds.length} 份文件的分類` }[mode]"
    :submit-label="mode === 'upload' ? (items.length > 1 ? `上傳 ${items.length} 份文件` : '上傳文件') : '儲存'"
    :busy="busy"
    :dirty="dirty"
    :error="error"
    @submit="submit"
  >
    <label v-if="mode === 'upload'" class="field">
      <span>文件檔案</span>
      <input
        :key="fileInputKey"
        type="file"
        multiple
        :required="!items.length"
        :disabled="busy"
        :accept="DOCUMENT_ACCEPT"
        @change="onFiles"
      />
      <small>可一次選擇多份。PDF、Word、Excel、PowerPoint、OpenDocument 或純文字檔，每份不超過 20 MB。</small>
    </label>

    <ul v-if="items.length" class="upload-list" aria-label="待上傳的文件">
      <li v-for="item in items" :key="item.key">
        <strong>{{ item.title }}</strong>
        <small class="edited">分類：{{ categoryOf(item) ?? '其他文件' }}</small>
        <span v-if="item.error" class="upload-list__error">{{ item.error }}</span>
      </li>
    </ul>
    <small v-if="items.length" class="upload-list__hint">標題是去掉副檔名的檔案名稱；檔名開頭寫學年和學期（例如 115(1)申請表.pdf）時，分類會是 115學年度第一學期。上傳後也可以再修改。</small>

    <label v-if="mode === 'edit'" class="field">
      <span>標題</span>
      <input v-model="form.title" required :maxlength="MAX_DOCUMENT_TITLE_LENGTH" />
    </label>
    <label class="field">
      <span>{{ mode === 'upload' ? '分類（選填，會套用到所有文件）' : '分類（選填）' }}</span>
      <input v-model="form.category" maxlength="100" :disabled="busy" />
      <small>{{ { upload: '留空時依檔名開頭的學期分類。', edit: '', batch: '留空時移到「其他文件」。' }[mode] }}例如 115學年度第一學期；輸入 115(1) 或 115-1 也會改成這個寫法。</small>
    </label>
  </EditorDialog>
</template>
