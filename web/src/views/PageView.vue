<script setup>
import { useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { currentUser, deletePage, fetchPage } from '../api.js';
import ItemStatus from '../components/ItemStatus.vue';
import PageEditor from '../components/PageEditor.vue';
import { confirmDelete } from '../page.js';
import { useCachedItem } from '../useCachedItem.js';

const props = defineProps({
  slug: { type: String, required: true },
  fallbackTitle: { type: String, default: '' },
});

const router = useRouter();
const editor = useTemplateRef('editor');

const state = useCachedItem(
  () => `page:${props.slug}`,
  () => fetchPage(props.slug),
  (page) => page.title,
);
const { item, status } = state;

const remove = () => confirmDelete(
  `確定要刪除頁面「${item.value.title}」嗎？`,
  () => deletePage(props.slug),
  () => router.push('/pages'),
);
</script>

<template>
  <div class="page">
    <div class="album-head">
      <h1 class="stop">{{ item?.title ?? (fallbackTitle || '找不到這個頁面') }}</h1>
      <div v-if="currentUser && status !== 'loading'" class="row-actions">
        <button type="button" class="button button--small" @click="editor.open({ slug, title: item?.title ?? fallbackTitle })">
          {{ item ? '編輯頁面' : '建立頁面' }}
        </button>
        <button v-if="item" type="button" class="button button--small button--quiet" @click="remove">刪除頁面</button>
      </div>
    </div>

    <ItemStatus :state="state" what="這個頁面">
      <template #missing>
        <p>這個頁面還沒有內容。</p>
      </template>
    </ItemStatus>

    <!-- html 已由 API 轉換並消毒 -->
    <div v-if="status === 'ready'" class="article__body article" v-html="item.html"></div>

    <PageEditor v-if="currentUser" ref="editor" />
  </div>
</template>
