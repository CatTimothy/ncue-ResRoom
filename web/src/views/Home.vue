<script setup>
import { fetchAlbums, fetchAnnouncements } from '../api.js';
import AlbumList from '../components/AlbumList.vue';
import AnnouncementList from '../components/AnnouncementList.vue';
import ListStatus from '../components/ListStatus.vue';
import { siteConfig, siteImage } from '../siteConfig.js';
import { usePagedList } from '../usePagedList.js';

const announcements = usePagedList(() => 'home:announcements', fetchAnnouncements, 5);
const albums = usePagedList(() => 'home:albums', fetchAlbums, 6);
const campus = siteImage('campusUrl');

// 警示磚的點陣；動畫從左下角、也就是引導線的起點擴散開來
const COLUMNS = 9;
const ROWS = 7;
const dots = Array.from({ length: COLUMNS * ROWS }, (_, i) => {
  const column = i % COLUMNS;
  const row = Math.floor(i / COLUMNS);
  return Math.round(Math.hypot(column, ROWS - 1 - row));
});
</script>

<template>
  <section class="hero" aria-labelledby="site-title">
    <div class="hero__text">
      <h1 id="site-title">
        <span v-if="siteConfig?.heroPrefix" class="hero__school">{{ siteConfig.heroPrefix }}</span>
        <span class="hero__unit">{{ siteConfig?.heroTitle }}</span>
      </h1>
      <p v-if="siteConfig?.heroText" class="hero__hours">{{ siteConfig.heroText }}</p>
    </div>
    <div class="hero__media">
      <div class="hero__dots" aria-hidden="true">
        <i v-for="(distance, i) in dots" :key="i" :style="{ '--distance': distance }"></i>
      </div>
      <img :src="campus" width="841" height="559" fetchpriority="high" :alt="siteConfig?.campusAlt ?? ''" />
    </div>
  </section>

  <div class="page">
    <section aria-labelledby="home-news">
      <div class="section-head stop">
        <h2 id="home-news">最新消息</h2>
        <RouterLink v-if="announcements.items.value.length" to="/announcements">查看所有消息</RouterLink>
      </div>
      <AnnouncementList :items="announcements.items.value" />
      <ListStatus :list="announcements" :show-more="false" empty-text="目前沒有新消息。" what="最新消息" />
    </section>

    <section aria-labelledby="home-photos">
      <div class="section-head stop">
        <h2 id="home-photos">活動剪影</h2>
        <RouterLink v-if="albums.items.value.length" to="/photos">查看所有相簿</RouterLink>
      </div>
      <AlbumList :items="albums.items.value" />
      <ListStatus :list="albums" :show-more="false" empty-text="目前沒有相簿。" what="相簿" />
    </section>
  </div>
</template>
