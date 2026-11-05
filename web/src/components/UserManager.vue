<script setup>
import { ref, useTemplateRef } from 'vue';
import { currentUser, fetchUsers } from '../api.js';
import { permissionsText } from '../permissions.js';
import AddUserDialog from './AddUserDialog.vue';
import EditPermissionsDialog from './EditPermissionsDialog.vue';

const addDialog = useTemplateRef('addDialog');
const editDialog = useTemplateRef('editDialog');
const users = ref(null);
const listError = ref('');
const success = ref('');

async function load() {
  listError.value = '';
  try {
    users.value = await fetchUsers();
  } catch (failure) {
    listError.value = failure.message;
  }
}
load();

async function reloadWith(message) {
  await load();
  success.value = message;
}
</script>

<template>
  <section class="user-settings__section">
    <h3>管理帳號</h3>
    <div class="admin-bar">
      <button type="button" class="button button--small" @click="addDialog.open()">新增帳號</button>
    </div>
    <p v-if="!users && !listError" class="loading">載入中…</p>
    <ul v-if="users" class="document-list">
      <li v-for="user in users" :key="user.username">
        <div>
          {{ user.username }}<template v-if="user.username === currentUser?.username">（你）</template><br />
          <small>{{ permissionsText(user.permissions) }}</small>
        </div>
        <button
          v-if="user.username !== currentUser?.username"
          type="button"
          class="button button--small button--quiet"
          :aria-label="`編輯 ${user.username} 的權限`"
          @click="editDialog.open(user)"
        >編輯權限</button>
      </li>
    </ul>
    <p v-if="listError" role="alert" class="notice notice--error">{{ listError }}</p>
    <p v-if="success" role="status" class="notice">{{ success }}</p>
    <AddUserDialog ref="addDialog" @created="reloadWith(`已新增 ${$event.username}，請對方登入後自行更改密碼。`)" />
    <EditPermissionsDialog ref="editDialog" @saved="reloadWith(`${$event.username} 的權限已更新。`)" />
  </section>
</template>
