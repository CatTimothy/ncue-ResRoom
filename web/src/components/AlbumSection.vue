<script setup>
import { onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from 'vue';
import { deleteAlbum } from '../api.js';
import { albumPhotosKey, cache } from '../cache.js';
import { albumDeleteQuestion } from '../format.js';
import { confirmDelete } from '../page.js';
import AlbumHeader from './AlbumHeader.vue';
import AlbumPhotos from './AlbumPhotos.vue';

const props = defineProps({ album: { type: Object, required: true } });
defineEmits(['edit']);

const titleId = useId();
const container = useTemplateRef('container');

// 接近畫面時才載入照片，開頁時不用一次送出每本相簿的請求。
// 已有快取就直接顯示，回到頁面時內容長度不變，捲動位置才能還原
const nearViewport = ref(Boolean(cache.read(albumPhotosKey(props.album.id))));
let observer = null;

onMounted(() => {
  if (nearViewport.value) return;
  observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    nearViewport.value = true;
    observer.disconnect();
  }, { rootMargin: '400px' });
  observer.observe(container.value);
});
onBeforeUnmount(() => observer?.disconnect());

const remove = () => confirmDelete(albumDeleteQuestion(props.album), () => deleteAlbum(props.album.id));
</script>

<template>
  <section class="album-section" :aria-labelledby="titleId">
    <AlbumHeader :album="album" heading="h2" :heading-id="titleId" linked @edit="$emit('edit', album)" @remove="remove" />
    <div ref="container" class="album-section__photos">
      <AlbumPhotos v-if="nearViewport" :album-id="album.id" :size="24" />
    </div>
  </section>
</template>
