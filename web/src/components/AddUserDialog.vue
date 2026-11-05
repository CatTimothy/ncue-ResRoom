<script setup>
import { createUser } from '../api.js';
import { PERMISSIONS } from '../permissions.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';
import PermissionChecks from './PermissionChecks.vue';

const emit = defineEmits(['created']);

// 預設可以編輯所有內容；管理帳號要另外勾選
const empty = () => ({
  username: '',
  password: '',
  permissions: Object.keys(PERMISSIONS).filter((permission) => permission !== 'MANAGE_USERS'),
});
const { dialog, form, changed, busy, error, show, run } = useEditor(empty());

// 每次開啟都清空，上次輸入的密碼不會留著
const open = () => show(empty());

const submit = () => run(async () => {
  const user = await createUser(form);
  dialog.value.close();
  emit('created', user);
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    title="新增帳號"
    submit-label="新增帳號"
    :busy="busy"
    :dirty="changed"
    :error="error"
    @submit="submit"
  >
    <label class="field">
      <span>帳號</span>
      <input v-model="form.username" required minlength="3" maxlength="50" pattern="[A-Za-z0-9._\-]+" autocomplete="off" />
      <small>3 到 50 個英數字、點、底線或連字號。</small>
    </label>
    <label class="field">
      <span>初始密碼</span>
      <input v-model="form.password" type="password" required minlength="12" maxlength="200" autocomplete="new-password" />
      <small>至少 12 個字元。請用安全的方式告訴對方。</small>
    </label>
    <PermissionChecks v-model="form.permissions" />
  </EditorDialog>
</template>
