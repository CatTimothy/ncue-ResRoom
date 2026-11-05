<script setup>
import { rocDateTimeText, wasEdited } from '../format.js';

defineProps({
  title: { type: String, required: true },
  submitLabel: { type: String, required: true },
  /** 標題的層級：在頁面上是 h1，在視窗裡是 h2 */
  heading: { type: String, default: 'h1' },
  headingId: { type: String, default: null },
  busy: Boolean,
  disabled: Boolean,
  error: { type: String, default: '' },
  /** 編輯既有內容時，顯示它的建立與編輯時間 */
  metaItem: { type: Object, default: null },
});
defineEmits(['submit', 'cancel']);
</script>

<template>
  <form class="form" @submit.prevent="$emit('submit')">
    <component :is="heading" :id="headingId" :class="{ stop: heading === 'h1' }">{{ title }}</component>
    <slot />
    <small v-if="metaItem" class="edited">
      建立於 {{ rocDateTimeText(metaItem.createdAt) }}
      <template v-if="wasEdited(metaItem)">；上次編輯 {{ rocDateTimeText(metaItem.modifiedAt) }}</template>
    </small>
    <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
    <div class="editor__actions">
      <button type="button" class="button button--quiet" :disabled="busy" @click="$emit('cancel')">取消</button>
      <button type="submit" class="button" :disabled="busy || disabled">{{ busy ? '處理中…' : submitLabel }}</button>
    </div>
  </form>
</template>
