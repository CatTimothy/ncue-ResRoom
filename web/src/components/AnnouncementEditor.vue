<script setup>
import { defineAsyncComponent, ref } from 'vue';
import { fetchAnnouncementSource, saveAnnouncement } from '../api.js';
import { fromLocalInput, toLocalInput } from '../format.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

// 編輯器很大，只有管理員開啟時才下載
const MarkdownEditor = defineAsyncComponent(() => import('./MarkdownEditor.vue'));

const { dialog, form, changed, loading, busy, error, reset, show, load, run } = useEditor({ title: '', content: '', publishedAt: '' });
const id = ref(null);
const source = ref(null);

function open(item = null) {
  id.value = item?.id ?? null;
  source.value = null;
  show({ title: item?.title ?? '', content: '', publishedAt: toLocalInput(item?.publishedAt ?? Date.now()) });
  if (!item) return;

  // 清單沒有 Markdown 原文，開啟時才取得
  load(async () => {
    source.value = await fetchAnnouncementSource(item.id);
    if (source.value) reset({ title: source.value.title, content: source.value.content, publishedAt: toLocalInput(source.value.publishedAt) });
    else error.value = '這則公告已被刪除，請關閉後重新整理。';
  });
}

function submit() {
  if (!form.content.trim()) {
    error.value = '請輸入公告內容。';
    return undefined;
  }
  return run(async () => {
    await saveAnnouncement({ ...form, id: id.value, publishedAt: fromLocalInput(form.publishedAt) });
    dialog.value.close();
  });
}

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    wide
    :title="id ? '編輯公告' : '新增公告'"
    :submit-label="id ? '儲存' : '發布公告'"
    :busy="busy"
    :disabled="loading"
    :dirty="changed"
    :error="error"
    :meta-item="source"
    @submit="submit"
  >
    <p v-if="loading" class="loading">載入中…</p>
    <label class="field">
      <span>標題</span>
      <input v-model="form.title" required maxlength="200" :disabled="loading" />
    </label>
    <label class="field">
      <span>發布時間</span>
      <input v-model="form.publishedAt" type="datetime-local" required :disabled="loading" />
      <small>排在未來的時間時，到了才會公開；在那之前只有登入的管理員看得到。</small>
    </label>
    <div class="field">
      <span>內容</span>
      <MarkdownEditor v-model="form.content" :disabled="loading" @error="error = $event" />
    </div>
  </EditorDialog>
</template>
