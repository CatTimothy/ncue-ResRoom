<script setup>
import { useRouter } from 'vue-router';
import { currentUser, deletePage, fetchPages } from '../api.js';
import ItemStatus from '../components/ItemStatus.vue';
import PageEditor from '../components/PageEditor.vue';
import { confirmDelete } from '../page.js';
import { useCachedItem } from '../useCachedItem.js';
import { useEditMode } from '../useEditMode.js';

const router = useRouter();
const { active: creating, close } = useEditMode('new');
const state = useCachedItem(() => 'pages', fetchPages);
const { item: pages } = state;

const remove = (page) => confirmDelete(`確定要刪除頁面「${page.title}」嗎？`, () => deletePage(page.slug));
</script>

<template>
  <div class="page">
    <PageEditor v-if="creating" @done="(slug) => router.replace(`/pages/${slug}`)" @cancel="close" />

    <template v-else>
      <h1 class="stop">所有頁面</h1>
      <div>
        <div v-if="currentUser" class="admin-bar">
          <RouterLink class="button button--small" to="/pages?new=1">新增頁面</RouterLink>
        </div>
        <ul v-if="pages?.length" class="document-list">
          <li v-for="page in pages" :key="page.slug">
            <RouterLink :to="`/pages/${page.slug}`">{{ page.title }}</RouterLink>
            <div v-if="currentUser" class="row-actions">
              <RouterLink class="button button--small button--quiet" :aria-label="`編輯頁面：${page.title}`" :to="`/pages/${page.slug}?edit=1`">編輯</RouterLink>
              <button type="button" class="button button--small button--quiet" :aria-label="`刪除頁面：${page.title}`" @click="remove(page)">刪除</button>
            </div>
          </li>
        </ul>
        <p v-else-if="pages">目前沒有頁面。</p>
        <ItemStatus :state="state" what="頁面清單" />
      </div>
    </template>
  </div>
</template>
