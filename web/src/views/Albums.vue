<script setup>
import { computed, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { currentUser, fetchAlbums } from '../api.js';
import AlbumEditor from '../components/AlbumEditor.vue';
import AlbumSection from '../components/AlbumSection.vue';
import ListStatus from '../components/ListStatus.vue';
import SearchBar from '../components/SearchBar.vue';
import { usePagedList } from '../usePagedList.js';

const route = useRoute();
const search = computed(() => route.query.q || null);
const editor = useTemplateRef('editor');

// 每本相簿都會另外載入照片，所以一次不要列太多本
const list = usePagedList(
  () => `albums:${search.value ?? ''}`,
  (limit, offset) => fetchAlbums(limit, offset, search.value),
  12,
);
</script>

<template>
  <div class="page">
    <h1 class="stop">活動剪影</h1>
    <div>
      <SearchBar label="搜尋相簿" placeholder="輸入相簿名稱或活動日期，例如 校外參訪、115/11" />
      <div v-if="currentUser" class="admin-bar">
        <button type="button" class="button button--small" @click="editor.open()">新增相簿</button>
      </div>
      <AlbumSection v-for="album in list.items.value" :key="album.id" :album="album" @edit="editor.open($event)" />
      <ListStatus
        :list="list"
        :empty-text="search ? `找不到符合「${search}」的相簿。可以換個關鍵字或日期。` : '目前沒有相簿。'"
        what="相簿"
      />
      <AlbumEditor v-if="currentUser" ref="editor" />
    </div>
  </div>
</template>
