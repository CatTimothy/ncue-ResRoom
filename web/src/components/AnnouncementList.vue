<script setup>
import { useTemplateRef } from 'vue';
import { currentUser, deleteAnnouncement } from '../api.js';
import { isScheduled, rocDate, rocDateText, wasEdited } from '../format.js';
import { confirmDelete } from '../page.js';
import AnnouncementEditor from './AnnouncementEditor.vue';

defineProps({ items: { type: Array, required: true } });

const editor = useTemplateRef('editor');

const remove = (item) => confirmDelete(`確定要刪除「${item.title}」嗎？`, () => deleteAnnouncement(item.id));
</script>

<template>
  <div v-if="currentUser" class="admin-bar">
    <button type="button" class="button button--small" @click="editor.open()">新增公告</button>
  </div>

  <ol v-if="items.length" class="announcement-list" :class="{ 'has-actions': currentUser }">
    <li v-for="item in items" :key="item.id">
      <time :datetime="item.publishedAt" :aria-label="rocDateText(item.publishedAt)">
        <span class="date__day">{{ rocDate(item.publishedAt).month }}/{{ rocDate(item.publishedAt).day }}</span>
        <span class="date__year">{{ rocDate(item.publishedAt).year }} 年</span>
      </time>
      <div>
        <RouterLink :to="`/announcements/${item.id}`">{{ item.title }}</RouterLink>
        <span v-if="isScheduled(item)" class="tag">尚未發布</span>
        <small v-if="wasEdited(item)" class="edited">編輯於 {{ rocDateText(item.modifiedAt) }}</small>
      </div>
      <div v-if="currentUser" class="row-actions">
        <button type="button" class="button button--small button--quiet" :aria-label="`編輯公告：${item.title}`" @click="editor.open(item)">編輯</button>
        <button type="button" class="button button--small button--quiet" :aria-label="`刪除公告：${item.title}`" @click="remove(item)">刪除</button>
      </div>
    </li>
  </ol>

  <AnnouncementEditor v-if="currentUser" ref="editor" />
</template>
