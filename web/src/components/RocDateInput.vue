<script setup>
import { ref, useTemplateRef, watch } from 'vue';
import { fromRocInput, toRocInput } from '../format.js';

// 瀏覽器內建的日期欄位只能顯示西元年，所以用文字欄位輸入民國日期。
// v-model 的值維持西元格式（YYYY-MM-DD 或 YYYY-MM-DDTHH:mm），格式不正確時為空字串。
const model = defineModel({ type: String, required: true });
const props = defineProps({ withTime: Boolean });

const input = useTemplateRef('input');
const text = ref(toRocInput(model.value));

function onInput(event) {
  text.value = event.target.value;
  const parsed = fromRocInput(text.value, props.withTime);
  // 格式不正確時由表單擋下送出，並顯示這段說明
  event.target.setCustomValidity(parsed === null
    ? `請輸入正確的民國${props.withTime ? '日期與時間，例如 115/11/04 15:20' : '日期，例如 115/11/04'}`
    : '');
  model.value = parsed ?? '';
}

function onBlur() {
  if (model.value) text.value = toRocInput(model.value);
}

// 內容由外部載入時更新顯示
watch(model, (value) => {
  if (value === (fromRocInput(text.value, props.withTime) ?? '')) return;
  text.value = toRocInput(value);
  input.value?.setCustomValidity('');
});
</script>

<template>
  <input
    ref="input"
    type="text"
    autocomplete="off"
    :value="text"
    :placeholder="withTime ? '115/11/04 15:20' : '115/11/04'"
    @input="onInput"
    @blur="onBlur"
  />
</template>
