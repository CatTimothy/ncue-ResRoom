<script setup>
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

defineProps({
  label: { type: String, required: true },
  placeholder: { type: String, required: true },
});

const route = useRoute();
const router = useRouter();
const inputId = useId();
const text = ref(route.query.q ?? '');
let timer = null;

function apply() {
  clearTimeout(timer);
  const q = text.value.trim();
  if (q !== (route.query.q ?? '')) router.replace({ query: q ? { q } : {} });
}

function onInput() {
  clearTimeout(timer);
  timer = setTimeout(apply, 300);
}

function clear() {
  text.value = '';
  apply();
}

// 按上一頁等造成網址改變時，輸入框也要跟著變
watch(() => route.query.q, (q) => {
  if ((q ?? '') !== text.value.trim()) text.value = q ?? '';
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <form class="search-bar" role="search" @submit.prevent="apply">
    <label :for="inputId">{{ label }}</label>
    <div class="search-bar__row">
      <input :id="inputId" v-model="text" type="search" :placeholder="placeholder" autocomplete="off" @input="onInput" />
      <button v-if="text" type="button" class="button button--small button--quiet" @click="clear">清除</button>
    </div>
  </form>
</template>
