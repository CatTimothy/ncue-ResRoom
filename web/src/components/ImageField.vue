<script setup>
import { ref, useId, useTemplateRef } from 'vue';
import { uploadContentImage } from '../api.js';

const props = defineProps({
  label: { type: String, required: true },
  /** 內建圖片的網址；model 是 null 時顯示它 */
  fallback: { type: String, required: true },
  hint: { type: String, default: '' },
});
const model = defineModel({ type: String, default: null });
const emit = defineEmits(['error']);

const id = useId();
const input = useTemplateRef('input');
const uploading = ref(false);

async function pick(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  uploading.value = true;
  try {
    model.value = (await uploadContentImage(file)).url;
  } catch (error) {
    emit('error', `${props.label}：${error.message}`);
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <div class="field image-field">
    <span :id="id">{{ label }}</span>
    <div class="image-field__row">
      <img class="image-field__preview" :src="model ?? fallback" alt="" />
      <div class="image-field__actions">
        <button type="button" class="button button--small button--quiet" :aria-describedby="id" :disabled="uploading" @click="input.click()">
          {{ uploading ? '上傳中…' : '上傳圖片' }}
        </button>
        <input ref="input" type="file" accept="image/*" hidden @change="pick" />
        <button v-if="model" type="button" class="button button--small button--quiet" @click="model = null">使用內建圖片</button>
      </div>
    </div>
    <small v-if="hint">{{ hint }}</small>
  </div>
</template>
