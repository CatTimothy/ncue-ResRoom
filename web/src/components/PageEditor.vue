<script setup>
import { computed, defineAsyncComponent, ref } from 'vue';
import { fetchPageSource, savePage } from '../api.js';
import { pagePath, parsePageUrl, RESERVED_SLUGS } from '../navigation.js';
import { useLeaveGuard } from '../useEditMode.js';
import { useEditor } from '../useEditor.js';
import EditorForm from './EditorForm.vue';

const RichTextEditor = defineAsyncComponent(() => import('./RichTextEditor.vue'));

const props = defineProps({
  /** 不提供時是新增頁面；提供時編輯（頁面不存在就建立） */
  slug: { type: String, default: null },
  /** 頁面不存在、要在目前的網址建立時，網址在第一層或 /pages 底下 */
  root: Boolean,
  initialTitle: { type: String, default: '' },
});
const emit = defineEmits(['done', 'cancel']);

const { form, changed, loading, loadFailed, busy, error, reset, markSaved, load, run } = useEditor({
  // 網址輸入框：「/test」在第一層，「test」或「/pages/test」在 /pages 底下
  url: props.slug ? pagePath({ slug: props.slug, root: props.root }) : '',
  title: props.initialTitle,
  format: 'MARKDOWN',
  content: '',
});
const creating = !props.slug;
/** 已存在的頁面目前的網址 { slug, root }；新增或頁面還不存在時是 null */
const existing = ref(null);
const existingSlug = computed(() => existing.value?.slug ?? null);
const parsed = computed(() => parsePageUrl(form.url));

useLeaveGuard(changed);

if (props.slug) {
  load(async () => {
    const page = await fetchPageSource(props.slug);
    if (!page) return;
    existing.value = { slug: page.slug, root: page.root };
    reset({ url: pagePath(page), title: page.title, format: page.format, content: page.source });
  });
}

const submit = () => run(async () => {
  const url = parsed.value;
  if (!url) {
    error.value = '網址只能用小寫英文、數字和連字號，例如 test、/test 或 /pages/test。';
    return;
  }
  if (url.root && RESERVED_SLUGS.includes(url.slug)) {
    error.value = `網址「/${url.slug}」已經用於網站功能，請換一個，或改成 /pages/${url.slug}。`;
    return;
  }
  // 儲存時相同 slug 會覆蓋舊內容，換成別的 slug 時要先確認沒有重複
  if (url.slug !== existingSlug.value && await fetchPageSource(url.slug)) {
    error.value = `網址「${url.slug}」已經有頁面了，請換一個。`;
    return;
  }
  await savePage({ ...form, ...url, previousSlug: existingSlug.value });
  markSaved();
  emit('done', pagePath(url));
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
    <label class="field">
      <span>頁面網址</span>
      <input v-model="form.url" required maxlength="110" placeholder="例如 guide-2026 或 /guide-2026" :disabled="loading" />
      <small>
        小寫英文、數字和連字號。輸入 guide-2026 會放在 /pages/guide-2026；開頭加上 /（例如 /guide-2026）會直接放在網站第一層。
        <template v-if="parsed">頁面網址：{{ pagePath(parsed) }}</template>
        <template v-if="existing && parsed && pagePath(parsed) !== pagePath(existing)">。修改網址後，頁首選單會跟著更新，但其他內容裡連到舊網址的連結不會改。</template>
      </small>
    </label>
    <fieldset class="format-choice">
      <legend>內容格式</legend>
      <label><input v-model="form.format" type="radio" value="MARKDOWN" :disabled="loading" /> 文字編輯器</label>
      <label><input v-model="form.format" type="radio" value="HTML" :disabled="loading" /> HTML</label>
    </fieldset>
    <div v-if="form.format === 'MARKDOWN'" class="field">
      <span>內容</span>
      <RichTextEditor v-model="form.content" :disabled="loading" label="內容" @error="error = $event" />
    </div>
    <label v-else class="field">
      <span>內容（HTML）</span>
      <textarea v-model="form.content" class="html-input" rows="20" spellcheck="false" :disabled="loading"></textarea>
      <small>會移除 &lt;script&gt;、&lt;style&gt;、style 屬性與事件屬性；&lt;iframe&gt; 只接受 YouTube 和 Google 地圖。切換格式不會轉換已輸入的內容。</small>
    </label>
  </EditorForm>
</template>
