<script setup>
import { reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { currentUser, login } from '../api.js';

const route = useRoute();
const router = useRouter();

const form = reactive({ username: '', password: '' });
const busy = ref(false);
const error = ref('');

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await login(form.username.trim(), form.password);
  } catch (failure) {
    error.value = failure.message;
    form.password = '';
  } finally {
    busy.value = false;
  }
}

/** 只回到本站的路徑，避免登入後被導向外部網站 */
function destination() {
  const target = route.query.redirect;
  return typeof target === 'string' && /^\/(?![/\\])/.test(target) ? target : '/';
}

watch(currentUser, (user) => {
  if (user) router.replace(destination());
}, { immediate: true });
</script>

<template>
  <div class="page">
    <h1 class="stop">管理員登入</h1>
    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>帳號</span>
        <input v-model="form.username" name="username" autocomplete="username" required autofocus />
      </label>
      <label class="field">
        <span>密碼</span>
        <input v-model="form.password" name="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
      <button type="submit" class="button" :disabled="busy">{{ busy ? '登入中…' : '登入' }}</button>
    </form>
  </div>
</template>
