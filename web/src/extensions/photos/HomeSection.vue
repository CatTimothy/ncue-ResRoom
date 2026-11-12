<script setup>
import { fetchAlbums } from '../../api.js';
import ListStatus from '../../components/ListStatus.vue';
import { usePagedList } from '../../usePagedList.js';
import AlbumList from './AlbumList.vue';

const albums = usePagedList(() => 'home:albums', fetchAlbums, 6);
</script>

<template>
  <section aria-labelledby="home-photos">
    <div class="section-head stop">
      <h2 id="home-photos">活動剪影</h2>
      <RouterLink v-if="albums.items.value.length" to="/photos">查看所有相簿</RouterLink>
    </div>
    <AlbumList :items="albums.items.value" />
    <ListStatus :list="albums" :show-more="false" empty-text="目前沒有相簿。" what="相簿" />
  </section>
</template>
