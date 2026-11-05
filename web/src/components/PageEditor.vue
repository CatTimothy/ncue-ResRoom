<script setup>
import { defineAsyncComponent } from 'vue';
import { fetchPageSource, savePage } from '../api.js';
import { useLeaveGuard } from '../useEditMode.js';
import { useEditor } from '../useEditor.js';
import EditorForm from './EditorForm.vue';

const MarkdownEditor = defineAsyncComponent(() => import('./MarkdownEditor.vue'));

const props = defineProps({
  /** 不提供時是新增頁面；提供時編輯（頁面不存在就建立） */
  slug: { type: String, default: null },
  initialTitle: { type: String, default: '' },
});
const emit = defineEmits(['done', 'cancel']);

const { form, changed, loading, loadFailed, busy, error, reset, markSaved, load, run } = useEditor({
  slug: props.slug ?? '',
  title: props.initialTitle,
  content: '',
});
const creating = !props.slug;

useLeaveGuard(changed);

if (props.slug) {
  load(async () => {
    const existing = await fetchPageSource(props.slug);
    if (existing) reset({ title: existing.title, content: existing.source });
  });
}

const submit = () => run(async () => {
  // 儲存時相同網址會覆蓋舊內容，新增時要先確認沒有重複
  if (creating && await fetchPageSource(form.slug)) {
    error.value = `網址「${form.slug}」已經有頁面了，請換一個。`;
    return;
  }
  await savePage(form);
  markSaved();
  emit('done', form.slug);
});
</script>

<template>
  <EditorForm
    class="form--page"
    :title="creating ? '新增頁面' : '編輯頁面'"
    :submit-label="creating ? '建立頁面' : '儲存'"
    :busy="busy"
    :disabled="loading || loadFailed"
    :error="error"
    @submit="submit"
    @cancel="emit('cancel')"
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
  </EditorForm>
</template>
