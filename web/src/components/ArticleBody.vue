<script setup>
import { computed } from 'vue';
import { splitBody } from '../articleSegments.js';
import PhotoGallery from './PhotoGallery.vue';

const props = defineProps({
  /** 已由 API 轉換並消毒 */
  html: { type: String, required: true },
  /** 儲存圖片說明的方式 (photo, alt) => Promise；沒有權限時不提供，圖片說明就不能編輯 */
  saveImageAlt: { type: Function, default: null },
});

const segments = computed(() => splitBody(props.html));
</script>

<template>
  <div class="article__body">
    <template v-for="(segment, position) in segments" :key="position">
      <PhotoGallery v-if="segment.photos" :photos="segment.photos" :save-alt="saveImageAlt" />
      <div v-else class="article__chunk" v-html="segment.html"></div>
    </template>
  </div>
</template>
