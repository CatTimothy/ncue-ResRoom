<script setup>
import { useRouter } from 'vue-router';
import { can, deletePage, fetchPage, fetchPageSource, savePage } from '../api.js';
import { replaceImageAlt } from '../articleSegments.js';
import ArticleBody from '../components/ArticleBody.vue';
import ItemStatus from '../components/ItemStatus.vue';
import PageEditor from '../components/PageEditor.vue';
import { confirmDelete } from '../page.js';
import { useCachedItem } from '../useCachedItem.js';
import { useEditMode } from '../useEditMode.js';

const props = defineProps({
  slug: { type: String, required: true },
  fallbackTitle: { type: String, default: '' },
});

const router = useRouter();
const { active: editing, close } = useEditMode('MANAGE_PAGES');

const state = useCachedItem(
  () => `page:${props.slug}`,
  () => fetchPage(props.slug),
  (page) => page.title,
);
const { item, status } = state;

/** 圖片的說明存在內文裡；用 HTML 寫的頁面對不到語法，要到編輯畫面改 */
async function saveImageAlt(photo, alt) {
  const { title, format, source } = await fetchPageSource(props.slug);
  await savePage({ slug: props.slug, title, format, content: replaceImageAlt(source, photo, alt) });
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
      :initial-title="item?.title ?? fallbackTitle"
      @done="close"
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
    </template>
  </div>
</template>
