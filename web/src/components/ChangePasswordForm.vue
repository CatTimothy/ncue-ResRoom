<script setup>
import { ref } from 'vue';
import { changePassword, currentUser } from '../api.js';
import { useEditor } from '../useEditor.js';

const EMPTY = { currentPassword: '', newPassword: '', confirmation: '' };
const { form, busy, error, reset, run } = useEditor(EMPTY);
const success = ref('');

const submit = () => run(async () => {
  success.value = '';
  if (form.newPassword !== form.confirmation) {
    error.value = '兩次輸入的新密碼不一樣。';
    return;
  }
  await changePassword(form);
  reset(EMPTY);
  success.value = '密碼已更改，其他裝置已登出。';
});
</script>

<template>
  <form class="form user-settings__section" @submit.prevent="submit">
    <h3>更改密碼</h3>
    <input type="text" name="username" autocomplete="username" :value="currentUser?.username" readonly hidden />
    <label class="field">
      <span>目前的密碼</span>
      <input v-model="form.currentPassword" type="password" required autocomplete="current-password" />
    </label>
    <label class="field">
      <span>新密碼</span>
      <input v-model="form.newPassword" type="password" required minlength="12" maxlength="200" autocomplete="new-password" />
      <small>至少 12 個字元。更改後，其他裝置會被登出。</small>
    </label>
    <label class="field">
      <span>再輸入一次新密碼</span>
      <input v-model="form.confirmation" type="password" required autocomplete="new-password" />
    </label>
    <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
    <p v-if="success" role="status" class="notice">{{ success }}</p>
    <div class="editor__actions">
      <button type="submit" class="button" :disabled="busy">{{ busy ? '處理中…' : '更改密碼' }}</button>
    </div>
  </form>
</template>
