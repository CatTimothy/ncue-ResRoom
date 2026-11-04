<script setup>
import { savedTimeText } from '../format.js';

defineProps({
  list: { type: Object, required: true },
  showMore: { type: Boolean, default: true },
  emptyText: { type: String, required: true },
  what: { type: String, required: true },
});
</script>

<template>
  <div class="list-status" aria-live="polite">
    <template v-if="list.failed.value">
      <p v-if="list.items.value.length && list.savedAt.value" class="notice">
        目前無法更新，顯示的是 {{ savedTimeText(list.savedAt.value) }} 儲存的內容。
      </p>
      <p v-else role="alert" class="notice notice--error">無法載入{{ what }}，請檢查網路後重新載入。</p>
      <button type="button" class="button" @click="list.retry()">重新載入</button>
    </template>
    <p v-else-if="list.busy.value" class="loading">載入中…</p>
    <p v-else-if="!list.items.value.length">{{ emptyText }}</p>
    <button v-else-if="showMore && list.hasMore.value" type="button" class="button" @click="list.more()">載入更多</button>
  </div>
</template>
