<script setup>
import { savedTimeText } from '../format.js';

defineProps({
  /** useCachedItem 的回傳值 */
  state: { type: Object, required: true },
  what: { type: String, required: true },
});
</script>

<template>
  <div v-if="state.stale.value" class="list-status" aria-live="polite">
    <p class="notice">目前無法更新，顯示的是 {{ savedTimeText(state.savedAt.value) }} 儲存的內容。</p>
    <button type="button" class="button" @click="state.refresh()">重新載入</button>
  </div>
  <div v-else-if="state.status.value !== 'ready'" class="list-status" aria-live="polite">
    <p v-if="state.status.value === 'loading'" class="loading">載入中…</p>
    <slot v-else-if="state.status.value === 'missing'" name="missing" />
    <template v-else>
      <p role="alert" class="notice notice--error">無法載入{{ what }}，請檢查網路後重新載入。</p>
      <button type="button" class="button" @click="state.refresh()">重新載入</button>
    </template>
  </div>
</template>
