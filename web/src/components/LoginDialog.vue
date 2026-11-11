<script setup>
import { reactive, useTemplateRef } from 'vue';
import { login } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';

// 登入是浮在目前頁面上的視窗，登入後留在原本的頁面
const dialog = useTemplateRef('dialog');
const { busy, error, run } = useEditor({});
const form = reactive({ username: '', password: '' });

const submit = () => run(async () => {
  try {
    await login(form.username.trim(), form.password);
  } finally {
    form.password = '';
  }
  dialog.value?.close(); // 登入後這個元件會被移除，視窗可能已經不在了
});

defineExpose({
  open() {
    error.value = '';
    dialog.value.open();
  },
});
</script>

<template>
  <EditorDialog ref="dialog" title="管理員登入" submit-label="登入" :busy="busy" :error="error" @submit="submit">
    <label class="field">
      <span>帳號</span>
      <input v-model="form.username" name="username" autocomplete="username" required autofocus />
    </label>
    <label class="field">
      <span>密碼</span>
      <input v-model="form.password" name="password" type="password" autocomplete="current-password" required />
    </label>
  </EditorDialog>
</template>
