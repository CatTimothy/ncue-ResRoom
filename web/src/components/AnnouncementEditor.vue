<script setup>
import { defineAsyncComponent, ref } from 'vue';
import { fetchAnnouncementSource, saveAnnouncement } from '../api.js';
import { fromLocalInput, toLocalInput } from '../format.js';
import { useLeaveGuard } from '../useEditMode.js';
import { useEditor } from '../useEditor.js';
import EditorForm from './EditorForm.vue';
import RocDateInput from './RocDateInput.vue';

// 編輯器很大，只有管理員開啟時才下載
const MarkdownEditor = defineAsyncComponent(() => import('./MarkdownEditor.vue'));

const props = defineProps({
  /** 不提供時是新增公告 */
  id: { type: String, default: null },
});
const emit = defineEmits(['done', 'cancel']);

const { form, changed, loading, loadFailed, busy, error, reset, markSaved, load, run } = useEditor({
  title: '',
  content: '',
  publishedAt: toLocalInput(Date.now()),
  unit: props.id ? '' : '資源教室',
  deadline: '',
  contactPerson: '',
  extension: '',
});
const source = ref(null);

useLeaveGuard(changed);

// 清單沒有 Markdown 原文，開啟時才取得
if (props.id) {
  load(async () => {
    source.value = await fetchAnnouncementSource(props.id);
    if (source.value) {
      reset({ ...source.value, publishedAt: toLocalInput(source.value.publishedAt), deadline: source.value.deadline ?? '' });
    } else {
      error.value = '這則公告已被刪除，請回到最新消息重新整理。';
    }
  });
}

function submit() {
  if (!form.content.trim()) {
    error.value = '請輸入公告內容。';
    return undefined;
  }
  return run(async () => {
    const saved = await saveAnnouncement({
      ...form,
      id: props.id,
      publishedAt: fromLocalInput(form.publishedAt),
      deadline: form.deadline || null,
    });
    markSaved();
    emit('done', saved.id);
  });
}
</script>

<template>
  <EditorForm
    class="form--page"
    :title="id ? '編輯公告' : '新增公告'"
    :submit-label="id ? '儲存' : '發布公告'"
    :busy="busy"
    :disabled="loading || loadFailed"
    :error="error"
    :meta-item="source"
    @submit="submit"
    @cancel="emit('cancel')"
  >
    <p v-if="loading" class="loading">載入中…</p>
    <label class="field">
      <span>公告標題</span>
      <input v-model="form.title" required maxlength="200" :disabled="loading" />
    </label>
    <div class="field-row">
      <label class="field">
        <span>公告單位</span>
        <input v-model="form.unit" maxlength="100" :disabled="loading" />
      </label>
      <label class="field">
        <span>聯絡人</span>
        <input v-model="form.contactPerson" maxlength="100" :disabled="loading" />
      </label>
      <label class="field">
        <span>分機</span>
        <input v-model="form.extension" maxlength="50" :disabled="loading" />
      </label>
    </div>
    <div class="field-row">
      <label class="field">
        <span>公告日期</span>
        <RocDateInput v-model="form.publishedAt" with-time required :disabled="loading" />
        <small>民國年月日與時間，例如 115/11/04 15:20。排在未來的時間時，到了才會公開；在那之前只有登入的管理員看得到。</small>
      </label>
      <label class="field">
        <span>截止日期（選填）</span>
        <RocDateInput v-model="form.deadline" :disabled="loading" />
        <small>民國年月日，例如 115/11/10。只用於顯示，過了截止日期公告仍會留著。</small>
      </label>
    </div>
    <div class="field">
      <span>詳細內容</span>
      <MarkdownEditor v-model="form.content" :disabled="loading" @error="error = $event" />
    </div>
  </EditorForm>
</template>
