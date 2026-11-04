<script setup>
import { fetchAnnouncement } from '../api.js';
import ItemStatus from '../components/ItemStatus.vue';
import { isScheduled, rocDateText, rocDateTimeText, wasEdited } from '../format.js';
import { useCachedItem } from '../useCachedItem.js';

const props = defineProps({ id: { type: String, required: true } });

const state = useCachedItem(
  () => `announcement:${props.id}`,
  () => fetchAnnouncement(props.id),
  (row) => row.title,
);
const { item, status } = state;
</script>

<template>
  <div class="page">
    <RouterLink class="back-link" to="/announcements">回到最新消息</RouterLink>

    <ItemStatus :state="state" what="這則消息">
      <template #missing>
        <h1 class="stop">找不到這則消息</h1>
        <p>它可能已被刪除，請回到最新消息查看其他內容。</p>
      </template>
    </ItemStatus>

    <article v-if="status === 'ready'" class="article">
      <h1 class="stop">{{ item.title }}</h1>
      <p class="article__date">
        <time :datetime="item.publishedAt">{{ rocDateText(item.publishedAt) }}</time>
        <span v-if="isScheduled(item)" class="tag">尚未發布</span>
      </p>
      <!-- html 已由 API 轉換並消毒 -->
      <div class="article__body" v-html="item.html"></div>
      <small v-if="wasEdited(item)" class="edited">編輯於 {{ rocDateTimeText(item.modifiedAt) }}</small>
    </article>
  </div>
</template>
