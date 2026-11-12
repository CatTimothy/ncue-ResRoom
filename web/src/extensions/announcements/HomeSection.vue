<script setup>
import { fetchAnnouncements } from '../../api.js';
import ListStatus from '../../components/ListStatus.vue';
import { usePagedList } from '../../usePagedList.js';
import AnnouncementList from './AnnouncementList.vue';

const announcements = usePagedList(() => 'home:announcements', fetchAnnouncements, 5);
</script>

<template>
  <section aria-labelledby="home-news">
    <div class="section-head stop">
      <h2 id="home-news">最新消息</h2>
      <RouterLink v-if="announcements.items.value.length" to="/announcements">查看所有消息</RouterLink>
    </div>
    <AnnouncementList :items="announcements.items.value" />
    <ListStatus :list="announcements" :show-more="false" empty-text="目前沒有新消息。" what="最新消息" />
  </section>
</template>
