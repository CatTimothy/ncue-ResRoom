<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { fetchAnnouncements } from '../api.js';
import AnnouncementList from '../components/AnnouncementList.vue';
import ListStatus from '../components/ListStatus.vue';
import SearchBar from '../components/SearchBar.vue';
import { usePagedList } from '../usePagedList.js';

const route = useRoute();
const search = computed(() => route.query.q || null);

const list = usePagedList(
  () => `announcements:${search.value ?? ''}`,
  (limit, offset) => fetchAnnouncements(limit, offset, search.value),
  20,
);
</script>

<template>
  <div class="page">
    <h1 class="stop">最新消息</h1>
    <div>
      <SearchBar label="搜尋公告" placeholder="輸入標題或日期，例如 115/11/4" />
      <AnnouncementList :items="list.items.value" />
      <ListStatus
        :list="list"
        :empty-text="search ? `找不到符合「${search}」的公告。可以換個關鍵字或日期。` : '目前沒有新消息。'"
        what="最新消息"
      />
    </div>
  </div>
</template>
