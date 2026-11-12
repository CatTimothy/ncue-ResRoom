<script setup>
import { ref } from 'vue';
import { setDisplayName, setUserPermissions } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';
import PermissionChecks from './PermissionChecks.vue';

const emit = defineEmits(['saved']);

const { dialog, form, changed, busy, error, show, run } = useEditor({ displayName: '', permissions: [] });
let original = null;
const username = ref('');

function open(user) {
  username.value = user.username;
  original = user;
  show({ displayName: user.displayName, permissions: [...user.permissions] });
}

const submit = () => run(async () => {
  // 只送出有修改的部分
  let user = original;
  if (form.displayName.trim() !== original.displayName) user = await setDisplayName(form.displayName, username.value);
  if (form.permissions.join() !== original.permissions.join()) user = await setUserPermissions(username.value, form.permissions);
  original = user;
  dialog.value.close();
  emit('saved', user);
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    :title="`編輯帳號 ${username}`"
    submit-label="儲存"
    :busy="busy"
    :dirty="changed"
    :error="error"
    @submit="submit"
  >
    <label class="field">
      <span>顯示名稱</span>
      <input v-model="form.displayName" maxlength="50" autocomplete="off" />
      <small>公開顯示在對方編輯過的頁面下方；留空就不顯示。</small>
    </label>
    <PermissionChecks v-model="form.permissions" />
  </EditorDialog>
</template>
