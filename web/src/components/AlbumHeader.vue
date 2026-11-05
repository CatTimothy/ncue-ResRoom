<script setup>
import { computed } from 'vue';
import { can } from '../api.js';
import { parseAlbum, rocDateText, rocShortDate, wasEdited } from '../format.js';

const props = defineProps({
  album: { type: Object, required: true },
  /** 標題的層級：單本相簿頁是 h1，相簿清單是 h2 */
  heading: { type: String, default: 'h1' },
  headingId: { type: String, default: null },
  /** 標題是否連到單本相簿頁 */
  linked: Boolean,
});
defineEmits(['edit', 'remove']);

const title = computed(() => parseAlbum(props.album.name));
</script>

<template>
  <header class="album-head">
    <div>
      <p v-if="title.term" class="term">{{ title.term }}</p>
      <component :is="heading" :id="headingId" class="stop">
        <RouterLink v-if="linked" :to="`/photos/${album.id}`">{{ title.name }}</RouterLink>
        <template v-else>{{ title.name }}</template>
      </component>
      <p class="article__date">
        活動日期：<time :datetime="album.eventDate">{{ rocDateText(album.eventDate) }}</time>，{{ album.photoCount }} 張
      </p>
      <small v-if="wasEdited(album)" class="edited edited--short">(編輯於 {{ rocShortDate(album.modifiedAt) }})</small>
    </div>
    <div v-if="can('MANAGE_ALBUMS')" class="row-actions">
      <button type="button" class="button button--small button--quiet" :aria-label="`編輯相簿：${album.name}`" @click="$emit('edit')">編輯相簿</button>
      <button type="button" class="button button--small button--quiet" :aria-label="`刪除相簿：${album.name}`" @click="$emit('remove')">刪除相簿</button>
    </div>
  </header>
</template>
