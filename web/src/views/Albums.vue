<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { fetchAlbums } from '../api.js';
import AlbumList from '../components/AlbumList.vue';
import ListStatus from '../components/ListStatus.vue';
import SearchBar from '../components/SearchBar.vue';
import { usePagedList } from '../usePagedList.js';

const route = useRoute();
const search = computed(() => route.query.q || null);

const list = usePagedList(
  () => `albums:${search.value ?? ''}`,
  (limit, offset) => fetchAlbums(limit, offset, search.value),
  24,
);
</script>

<template>
  <div class="page">
    <h1 class="stop">活動剪影</h1>
    <div>
      <SearchBar label="搜尋相簿" placeholder="輸入相簿名稱或日期，例如 校外參訪、115/11" />
      <AlbumList :items="list.items.value" />
      <ListStatus
        :list="list"
        :empty-text="search ? `找不到符合「${search}」的相簿。可以換個關鍵字或日期。` : '目前沒有相簿。'"
        what="相簿"
      />
    </div>
  </div>
</template>
