<script setup>
import { ref } from 'vue';
import { setUserPermissions } from '../api.js';
import { useEditor } from '../useEditor.js';
import EditorDialog from './EditorDialog.vue';
import PermissionChecks from './PermissionChecks.vue';

const emit = defineEmits(['saved']);

const { dialog, form, changed, busy, error, show, run } = useEditor({ permissions: [] });
const username = ref('');

function open(user) {
  username.value = user.username;
  show({ permissions: [...user.permissions] });
}

const submit = () => run(async () => {
  const user = await setUserPermissions(username.value, form.permissions);
  dialog.value.close();
  emit('saved', user);
});

defineExpose({ open });
</script>

<template>
  <EditorDialog
    ref="dialog"
    :title="`編輯 ${username} 的權限`"
    submit-label="儲存"
    :busy="busy"
    :dirty="changed"
    :error="error"
    @submit="submit"
  >
    <PermissionChecks v-model="form.permissions" />
  </EditorDialog>
</template>
