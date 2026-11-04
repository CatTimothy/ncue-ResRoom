<script setup>
import { computed, ref } from 'vue';
import { fetchAlbums, updatePhoto, uploadPhotos } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

const props = defineProps({ albumId: { type: String, required: true } });

const { dialog, form, changed, busy, error, show, load, run } = useEditor({ alt: '', albumId: '' });
const items = ref([]); // 待上傳的照片：{ file, number, error }
const albums = ref([]);
const fileInputKey = ref(0);
const id = ref(null);
const progress = ref(0);
let stopRequested = false;

const dirty = computed(() => items.value.length > 0 || changed.value);
const uploading = computed(() => busy.value && !id.value);

/** 傳入 photo 時編輯；不傳時上傳新照片到這本相簿 */
function open(photo = null) {
  id.value = photo?.id ?? null;
  items.value = [];
  albums.value = [];
  fileInputKey.value++;
  show({ alt: photo?.alt ?? '', albumId: props.albumId });
  // 編輯時可以把照片移到別本相簿
  if (photo) load(async () => { albums.value = await fetchAlbums(100); });
}

function onFiles(event) {
  const files = [...event.target.files];
  // 多張時要加編號，否則每張的說明都相同，螢幕報讀軟體使用者無法分辨
  items.value = files.map((file, index) => ({ file, number: files.length > 1 ? index + 1 : null, error: '' }));
  error.value = '';
}

async function upload() {
  stopRequested = false;
  progress.value = 0;
  const result = await uploadPhotos(
    items.value,
    { alt: form.alt, albumId: props.albumId },
    { onProgress: (current) => { progress.value = current; }, shouldStop: () => stopRequested },
  );
  if (!result.failed.length && !result.remaining.length) {
    items.value = [];
    dialog.value.close();
    return;
  }

  // 留下還沒傳成功的照片，可以直接重試；已傳成功的不會重複上傳
  items.value = [
    ...result.failed.map(({ item, message }) => ({ ...item, error: message })),
    ...result.remaining.map((item) => ({ ...item, error: '' })),
  ];
  fileInputKey.value++;
  error.value = `已上傳 ${result.uploaded} 張，還有 ${items.value.length} 張沒有上傳。可以重新上傳，或按取消放棄。`;
}

const submit = () => run(async () => {
  if (!id.value) {
    await upload();
    return;
  }
  await updatePhoto({ id: id.value, alt: form.alt, albumId: form.albumId });
  dialog.value.close();
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    :title="id ? '編輯照片' : '新增照片'"
    :submit-label="id ? '儲存' : items.length > 1 ? `上傳 ${items.length} 張照片` : '上傳照片'"
    :busy="busy"
    :dirty="dirty"
    :error="error"
    @submit="submit"
  >
    <label v-if="!id" class="field">
      <span>照片檔案</span>
      <input
        :key="fileInputKey"
        type="file"
        accept="image/*"
        multiple
        :required="!items.length"
        :disabled="busy"
        @change="onFiles"
      />
      <small>可一次選擇多張。網頁會顯示壓縮版，原始檔保留供下載。</small>
    </label>

    <ul v-if="items.length" class="upload-list" aria-label="待上傳的照片">
      <li v-for="item in items" :key="item.number ?? item.file.name">
        <span>{{ item.file.name }}</span>
        <span v-if="item.error" class="upload-list__error">{{ item.error }}</span>
      </li>
    </ul>

    <label class="field">
      <span>照片說明</span>
      <input v-model="form.alt" required :maxlength="items.length > 1 ? 480 : 500" :disabled="busy" />
      <small v-if="items.length > 1">每張會自動加上編號，例如「{{ form.alt.trim() || '說明' }}（第 1 張）」；上傳後可以逐張修改。</small>
      <small v-else>描述照片的內容，螢幕報讀軟體會讀出這段文字。</small>
    </label>

    <label v-if="id" class="field">
      <span>所屬相簿</span>
      <select v-model="form.albumId" required>
        <option v-if="!albums.some((album) => album.id === form.albumId)" :value="form.albumId">目前的相簿</option>
        <option v-for="album in albums" :key="album.id" :value="album.id">{{ album.name }}</option>
      </select>
    </label>

    <div v-if="uploading" class="upload-progress">
      <label>
        <span role="status">正在上傳第 {{ progress }} 張，共 {{ items.length }} 張</span>
        <progress :max="items.length" :value="progress"></progress>
      </label>
      <button type="button" class="button button--small button--quiet" @click="stopRequested = true">停止上傳</button>
    </div>
  </EditorDialog>
</template>
