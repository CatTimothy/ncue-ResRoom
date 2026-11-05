<script setup>
import { fetchPhotos } from '../api.js';
import { albumPhotosKey } from '../cache.js';
import { usePagedList } from '../usePagedList.js';
import ListStatus from './ListStatus.vue';
import PhotoGallery from './PhotoGallery.vue';

const props = defineProps({
  albumId: { type: String, required: true },
  size: { type: Number, default: 48 },
});

const photos = usePagedList(
  () => albumPhotosKey(props.albumId),
  (limit, offset) => fetchPhotos(props.albumId, limit, offset),
  props.size,
);
</script>

<template>
  <PhotoGallery :photos="photos.items.value" :album-id="albumId" />
  <ListStatus :list="photos" empty-text="這本相簿還沒有照片。" what="照片" />
</template>
