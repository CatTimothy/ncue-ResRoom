<script setup>
import { useId, useTemplateRef } from 'vue';
import { rocDateTimeText, wasEdited } from '../format.js';

const props = defineProps({
  title: { type: String, required: true },
  submitLabel: { type: String, required: true },
  busy: Boolean,
  disabled: Boolean,
  dirty: Boolean,
  wide: Boolean,
  error: { type: String, default: '' },
  /** 編輯既有內容時，顯示它的建立與編輯時間 */
  metaItem: { type: Object, default: null },
});
defineEmits(['submit']);

const titleId = useId();
const dialog = useTemplateRef('dialog');

function requestClose() {
  if (props.busy) return; // 處理中關閉視窗會看不到結果
  if (props.dirty && !window.confirm('尚未儲存的內容會遺失，確定要關閉嗎？')) return;
  dialog.value.close();
}

defineExpose({
  open: () => dialog.value.showModal(),
  close: () => dialog.value.close(),
});
</script>

<template>
  <dialog ref="dialog" class="editor" :class="{ 'editor--wide': wide }" :aria-labelledby="titleId" @cancel.prevent="requestClose">
    <form class="form" @submit.prevent="$emit('submit')">
      <h2 :id="titleId">{{ title }}</h2>
      <slot />
      <small v-if="metaItem" class="edited">
        建立於 {{ rocDateTimeText(metaItem.createdAt) }}
        <template v-if="wasEdited(metaItem)">；上次編輯 {{ rocDateTimeText(metaItem.modifiedAt) }}</template>
      </small>
      <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
      <div class="editor__actions">
        <button type="button" class="button button--quiet" :disabled="busy" @click="requestClose">取消</button>
        <button type="submit" class="button" :disabled="busy || disabled">{{ busy ? '處理中…' : submitLabel }}</button>
      </div>
    </form>
  </dialog>
</template>
