<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { saveAlbum } from '../api.js';
import { fromLocalInput, toLocalInput } from '../format.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

const router = useRouter();
const { dialog, form, changed, busy, error, show, run } = useEditor({ name: '', publishedAt: '' });
const album = ref(null);

function open(existing = null) {
  album.value = existing;
  show({ name: existing?.name ?? '', publishedAt: toLocalInput(existing?.publishedAt ?? Date.now()) });
}

const submit = () => run(async () => {
  const { id } = await saveAlbum({ id: album.value?.id, name: form.name, publishedAt: fromLocalInput(form.publishedAt) });
  dialog.value.close();
  // 新相簿還沒有照片，直接帶到相簿頁開始新增
  if (!album.value) router.push(`/photos/${id}`);
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    :title="album ? '編輯相簿' : '新增相簿'"
    :submit-label="album ? '儲存' : '建立相簿'"
    :busy="busy"
    :dirty="changed"
    :error="error"
    :meta-item="album"
    @submit="submit"
  >
    <label class="field">
      <span>相簿名稱</span>
      <input v-model="form.name" required maxlength="100" />
      <small>例如 110(1)校外參訪活動；開頭寫學年和學期時，會顯示學期標籤。</small>
    </label>
    <label class="field">
      <span>發布時間</span>
      <input v-model="form.publishedAt" type="datetime-local" required />
      <small>排在未來的時間時，到了才會公開。沒有照片的相簿也不會公開列出。</small>
    </label>
  </EditorDialog>
</template>
