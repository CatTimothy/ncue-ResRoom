<script setup>
import { nextTick, ref, useTemplateRef, watch } from 'vue';
import { useEditor } from '../useEditor.js';

const props = defineProps({
  photo: { type: Object, required: true },
  /** 儲存說明的方式 (photo, alt) => Promise。有提供時，點文字就能編輯；相簿和文章的存法不同，由外層決定 */
  save: { type: Function, default: null },
});

const { form, busy, error, reset, run } = useEditor({ alt: '' });
const input = useTemplateRef('input');
const button = useTemplateRef('button');
const editing = ref(false);
// 儲存後先顯示新的說明，不用等清單重新載入
const shown = ref(props.photo.alt);
watch(() => props.photo.alt, (alt) => {
  shown.value = alt;
});
// 換照片時沿用同一個按鈕，焦點才不會消失，方向鍵也能繼續換下一張
watch(() => props.photo.id, () => {
  shown.value = props.photo.alt;
  editing.value = false;
});

async function startEditing() {
  reset({ alt: shown.value });
  error.value = '';
  editing.value = true;
  await nextTick();
  input.value.select();
}

async function stopEditing() {
  editing.value = false;
  await nextTick();
  button.value?.focus();
}

const submit = () => run(async () => {
  const alt = form.alt.trim();
  if (alt !== shown.value) await props.save(props.photo, alt);
  shown.value = alt;
  await stopEditing();
});

defineExpose({
  /** 正在編輯時取消並回傳 true；燈箱用來判斷 Esc 要取消編輯還是關閉 */
  cancelEditing() {
    if (!editing.value) return false;
    stopEditing();
    return true;
  },
});
</script>

<template>
  <form v-if="editing" class="lightbox__alt-form" @submit.prevent="submit">
    <input ref="input" v-model="form.alt" required maxlength="500" aria-label="照片說明" :disabled="busy" />
    <button type="submit" class="button button--small" :disabled="busy">{{ busy ? '處理中…' : '儲存' }}</button>
    <button type="button" class="button button--small" :disabled="busy" @click="stopEditing">取消</button>
    <p v-if="error" role="alert" class="lightbox__alt-error">{{ error }}</p>
  </form>
  <button
    v-else-if="save"
    ref="button"
    type="button"
    class="lightbox__alt"
    title="點擊編輯照片說明"
    :aria-label="`編輯照片說明：${shown}`"
    @click="startEditing"
  >
    {{ shown }}
    <svg class="lightbox__alt-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4" />
    </svg>
  </button>
  <template v-else>{{ shown }}</template>
</template>
