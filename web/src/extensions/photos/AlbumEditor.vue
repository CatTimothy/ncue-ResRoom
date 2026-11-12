<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { saveAlbum } from '../../api.js';
import { taipeiDay } from '../../format.js';
import { useEditor } from '../../useEditor.js';
import EditorDialog from '../../components/EditorDialog.vue';
import RocDateInput from '../../components/RocDateInput.vue';

const router = useRouter();
const { dialog, form, changed, busy, error, show, run } = useEditor({ name: '', eventDate: '' });
const album = ref(null);

function open(existing = null) {
  album.value = existing;
  show({ name: existing?.name ?? '', eventDate: existing?.eventDate ?? taipeiDay() });
}

const submit = () => run(async () => {
  const { id } = await saveAlbum({ id: album.value?.id, name: form.name, eventDate: form.eventDate });
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
      <span>活動日期</span>
      <RocDateInput v-model="form.eventDate" required />
      <small>民國年月日，例如 115/11/04。相簿依活動日期由新到舊排列；沒有照片的相簿不會公開列出。</small>
    </label>
  </EditorDialog>
</template>
