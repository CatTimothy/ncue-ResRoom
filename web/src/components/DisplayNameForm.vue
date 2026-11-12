<script setup>
import { ref } from 'vue';
import { currentUser, setDisplayName } from '../api.js';
import { useEditor } from '../useEditor.js';

const { form, changed, busy, error, reset, run } = useEditor({ displayName: currentUser.value?.displayName ?? '' });
const success = ref('');

const submit = () => run(async () => {
  success.value = '';
  const user = await setDisplayName(form.displayName);
  reset({ displayName: user.displayName });
  success.value = user.displayName ? '顯示名稱已更新。' : '已清除顯示名稱。';
});
</script>

<template>
  <form class="form user-settings__section" @submit.prevent="submit">
    <h3>顯示名稱</h3>
    <label class="field">
      <span>顯示名稱</span>
      <input v-model="form.displayName" maxlength="50" autocomplete="nickname" />
      <small>公開顯示在你編輯過的頁面下方（「最後編輯於…，編輯者：…」）；留空就不顯示。登入用的帳號 {{ currentUser?.username }} 不會公開。</small>
    </label>
    <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
    <p v-if="success" role="status" class="notice">{{ success }}</p>
    <div class="editor__actions">
      <button type="submit" class="button" :disabled="busy || !changed">{{ busy ? '處理中…' : '儲存顯示名稱' }}</button>
    </div>
  </form>
</template>
