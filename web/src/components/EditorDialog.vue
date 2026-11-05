<script setup>
import { useId, useTemplateRef } from 'vue';
import EditorForm from './EditorForm.vue';

// 其餘的屬性與事件都直接交給 EditorForm
defineOptions({ inheritAttrs: false });
const props = defineProps({
  busy: Boolean,
  dirty: Boolean,
});

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
  <dialog ref="dialog" class="editor" :aria-labelledby="titleId" @cancel.prevent="requestClose">
    <EditorForm v-bind="$attrs" heading="h2" :heading-id="titleId" :busy="busy" @cancel="requestClose">
      <slot />
    </EditorForm>
  </dialog>
</template>
