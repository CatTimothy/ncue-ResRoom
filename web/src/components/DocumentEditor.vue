<script setup>
import { computed, ref } from 'vue';
import { updateDocument, uploadDocument } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

const { dialog, form, changed, busy, error, show, run } = useEditor({ title: '', category: '' });
const file = ref(null);
const fileInputKey = ref(0);
const id = ref(null);
const dirty = computed(() => Boolean(file.value) || changed.value);

function open(item = null) {
  id.value = item?.id ?? null;
  file.value = null;
  fileInputKey.value++;
  show({ title: item?.title ?? '', category: item?.category ?? '' });
}

function onFile(event) {
  file.value = event.target.files[0] ?? null;
  if (file.value && !form.title) form.title = file.value.name.replace(/\.[^.]+$/, '');
}

const submit = () => run(async () => {
  const fields = { title: form.title, category: form.category.trim() || null };
  if (id.value) await updateDocument({ id: id.value, ...fields });
  else await uploadDocument({ file: file.value, ...fields });
  dialog.value.close();
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    :title="id ? '編輯文件' : '新增文件'"
    :submit-label="id ? '儲存' : '上傳文件'"
    :busy="busy"
    :dirty="dirty"
    :error="error"
    @submit="submit"
  >
    <label v-if="!id" class="field">
      <span>文件檔案</span>
      <input :key="fileInputKey" type="file" required accept=".pdf,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt" @change="onFile" />
      <small>PDF、Word、Excel、PowerPoint、OpenDocument 或純文字檔，不超過 20 MB。</small>
    </label>
    <label class="field">
      <span>標題</span>
      <input v-model="form.title" required maxlength="200" />
    </label>
    <label class="field">
      <span>分類（選填）</span>
      <input v-model="form.category" maxlength="100" />
      <small>例如 111學年度第一學期。</small>
    </label>
  </EditorDialog>
</template>
