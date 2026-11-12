<script setup>
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { can, deletePage, fetchPage, fetchPageSource, savePage } from '../api.js';
import { replaceImageAlt } from '../articleSegments.js';
import ArticleBody from '../components/ArticleBody.vue';
import ItemStatus from '../components/ItemStatus.vue';
import PageEditor from '../components/PageEditor.vue';
import { rocDateTimeText } from '../format.js';
import { pagePath } from '../navigation.js';
import { confirmDelete } from '../page.js';
import { useCachedItem } from '../useCachedItem.js';
import { useEditMode } from '../useEditMode.js';

const props = defineProps({
  slug: { type: String, required: true },
  /** 從哪一種網址進來：true 是 /<slug>，false 是 /pages/<slug> */
  root: Boolean,
  fallbackTitle: { type: String, default: '' },
});

const route = useRoute();
const router = useRouter();
const { active: editing, close } = useEditMode('MANAGE_PAGES');

const state = useCachedItem(
  () => `page:${props.slug}`,
  () => fetchPage(props.slug),
  (page) => page.title,
);
const { item, status } = state;

// 頁面的網址在另一種位置時（例如 /test 的頁面設在 /pages/test），轉到正確的網址
watch(item, (page) => {
  if (page && page.slug === props.slug && page.root !== props.root) {
    router.replace({ path: pagePath(page), query: route.query, hash: route.hash });
  }
}, { immediate: true });

/** 編輯完成：網址改了就換到新的網址 */
function done(path) {
  if (path === route.path) close();
  else router.replace(path);
}

/** 圖片的說明存在內文裡；用 HTML 寫的頁面對不到語法，要到編輯畫面改 */
async function saveImageAlt(photo, alt) {
  const { root, title, format, source } = await fetchPageSource(props.slug);
  await savePage({ slug: props.slug, root, title, format, content: replaceImageAlt(source, photo, alt) });
}

const remove = () => confirmDelete(
  `確定要刪除頁面「${item.value.title}」嗎？`,
  () => deletePage(props.slug),
  () => router.push('/pages'),
);
</script>

<template>
  <div class="page">
    <PageEditor
      v-if="editing"
      :key="slug"
      :slug="slug"
      :root="root"
      :initial-title="item?.title ?? fallbackTitle"
      @done="done"
      @cancel="close"
    />

    <template v-else>
      <div class="album-head">
        <h1 class="stop">{{ item?.title ?? (fallbackTitle || '找不到這個頁面') }}</h1>
        <div v-if="can('MANAGE_PAGES') && status !== 'loading'" class="row-actions">
          <RouterLink class="button button--small" :to="{ query: { edit: '1' } }">
            {{ item ? '編輯頁面' : '建立頁面' }}
          </RouterLink>
          <button v-if="item" type="button" class="button button--small button--quiet" @click="remove">刪除頁面</button>
        </div>
      </div>

      <ItemStatus :state="state" what="這個頁面">
        <template #missing>
          <p>這個頁面還沒有內容。</p>
        </template>
      </ItemStatus>

      <ArticleBody
        v-if="status === 'ready'"
        class="article"
        :html="item.html"
        :save-image-alt="can('MANAGE_PAGES') && item.format === 'MARKDOWN' ? saveImageAlt : null"
      />
      <small v-if="status === 'ready'" class="edited page-dates">
        最後編輯於 {{ rocDateTimeText(item.updatedAt) }}<template v-if="item.updatedBy">，編輯者：{{ item.updatedBy }}</template>
      </small>
    </template>
  </div>
</template>
