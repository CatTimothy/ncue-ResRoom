<script setup>
import { computed } from 'vue';
import { splitBody } from '../articleSegments.js';
import PhotoGallery from './PhotoGallery.vue';

const props = defineProps({
  /** 已由 API 轉換並消毒 */
  html: { type: String, required: true },
});

const segments = computed(() => splitBody(props.html));
</script>

<template>
  <div class="article__body">
    <template v-for="(segment, position) in segments" :key="position">
      <PhotoGallery v-if="segment.photos" :photos="segment.photos" />
      <div v-else class="article__chunk" v-html="segment.html"></div>
    </template>
  </div>
</template>
