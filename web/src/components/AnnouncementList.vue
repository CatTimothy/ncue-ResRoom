<script setup>
import { computed } from 'vue';
import { can, deleteAnnouncement } from '../api.js';
import { deleteQuestion, groupByYear, isScheduled, monthDayText, rocDateText, rocShortDate, wasEdited } from '../format.js';
import { confirmDelete } from '../page.js';

const props = defineProps({ items: { type: Array, required: true } });

const groups = computed(() => groupByYear(props.items));

const remove = (item) => confirmDelete(deleteQuestion(item.title), () => deleteAnnouncement(item.id));
</script>

<template>
  <div v-if="can('MANAGE_ANNOUNCEMENTS')" class="admin-bar">
    <RouterLink class="button button--small" to="/announcements?new=1">新增公告</RouterLink>
  </div>

  <!-- 左側的線條連起同一年的公告，線條中斷處就是換年 -->
  <div v-for="group in groups" :key="group.year" class="announcement-year">
    <p class="announcement-year__label">{{ group.year }} 年</p>
    <ol class="announcement-list" :class="{ 'has-actions': can('MANAGE_ANNOUNCEMENTS') }">
      <li v-for="item in group.items" :key="item.id">
        <time class="date__day" :datetime="item.publishedAt" :aria-label="rocDateText(item.publishedAt)">{{ monthDayText(item.publishedAt) }}</time>
        <div>
          <RouterLink :to="`/announcements/${item.id}`">{{ item.title }}</RouterLink>
          <span v-if="isScheduled(item)" class="tag">尚未發布</span>
          <small v-if="wasEdited(item)" class="edited edited--short">(編輯於 {{ rocShortDate(item.modifiedAt) }})</small>
        </div>
        <div v-if="can('MANAGE_ANNOUNCEMENTS')" class="row-actions">
          <RouterLink class="button button--small button--quiet" :aria-label="`編輯公告：${item.title}`" :to="`/announcements/${item.id}?edit=1`">編輯</RouterLink>
          <button type="button" class="button button--small button--quiet" :aria-label="`刪除公告：${item.title}`" @click="remove(item)">刪除</button>
        </div>
      </li>
    </ol>
  </div>
</template>
