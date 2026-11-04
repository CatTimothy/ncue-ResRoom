<script setup>
import { defineAsyncComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fetchPageSource, savePage } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

const MarkdownEditor = defineAsyncComponent(() => import('./MarkdownEditor.vue'));

const router = useRouter();
const { dialog, form, changed, loading, busy, error, reset, show, load, run } = useEditor({ slug: '', title: '', content: '' });
const creating = ref(false);

/** 傳入 { slug, title } 時編輯（頁面不存在就建立）；不傳時新增頁面 */
function open(page = null) {
  creating.value = !page;
  show({ slug: page?.slug ?? '', title: page?.title ?? '', content: '' });
  if (!page) return;

  load(async () => {
    const existing = await fetchPageSource(page.slug);
    if (existing) reset({ title: existing.title, content: existing.source });
  });
}

const submit = () => run(async () => {
  // 儲存時相同網址會覆蓋舊內容，新增時要先確認沒有重複
  if (creating.value && await fetchPageSource(form.slug)) {
    error.value = `網址「${form.slug}」已經有頁面了，請換一個。`;
    return;
  }
  await savePage(form);
  dialog.value.close();
  if (creating.value) router.push(`/pages/${form.slug}`);
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    wide
    :title="creating ? '新增頁面' : '編輯頁面'"
    :submit-label="creating ? '建立頁面' : '儲存'"
    :busy="busy"
    :disabled="loading"
    :dirty="changed"
    :error="error"
    @submit="submit"
  >
    <p v-if="loading" class="loading">載入中…</p>
    <label class="field">
      <span>頁面標題</span>
      <input v-model="form.title" required maxlength="200" :disabled="loading" />
    </label>
    <label v-if="creating" class="field">
      <span>頁面網址</span>
      <input v-model="form.slug" required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      <small>小寫英文、數字和連字號，例如 guide-2026。頁面會出現在 /pages/guide-2026。</small>
    </label>
    <div class="field">
      <span>內容</span>
      <MarkdownEditor v-model="form.content" :disabled="loading" @error="error = $event" />
    </div>
  </EditorDialog>
</template>
