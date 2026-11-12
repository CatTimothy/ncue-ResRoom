<script setup>
import { ref, useTemplateRef, watch } from 'vue';
import { currentUser, deleteUser, fetchUsers } from '../api.js';
import { confirmDelete } from '../page.js';
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
// 在同一個視窗改了自己的顯示名稱時，清單也要更新
watch(() => currentUser.value?.displayName, load);

async function reloadWith(message) {
  await load();
  success.value = message;
}

const remove = (user) => confirmDelete(
  `確定要刪除帳號「${user.username}」嗎？對方會立刻被登出，編輯過的頁面會保留。`,
  () => deleteUser(user.username),
  () => reloadWith(`已刪除 ${user.username}。`),
);
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
          {{ user.displayName ? `${user.displayName}（${user.username}）` : user.username }}<template v-if="user.username === currentUser?.username">（你）</template>
          <span v-if="user.usesDefaultPassword" class="tag tag--warning">使用預設密碼</span><br />
          <small>{{ permissionsText(user.permissions) }}</small>
        </div>
        <div v-if="user.username !== currentUser?.username" class="row-actions">
          <button
            type="button"
            class="button button--small button--quiet"
            :aria-label="`編輯帳號 ${user.username}`"
            @click="editDialog.open(user)"
          >編輯</button>
          <button
            type="button"
            class="button button--small button--quiet"
            :aria-label="`刪除帳號 ${user.username}`"
            @click="remove(user)"
          >刪除</button>
        </div>
      </li>
    </ul>
    <p v-if="listError" role="alert" class="notice notice--error">{{ listError }}</p>
    <p v-if="success" role="status" class="notice">{{ success }}</p>
    <AddUserDialog ref="addDialog" @created="reloadWith(`已新增 ${$event.username}，請對方登入後自行更改密碼。`)" />
    <EditPermissionsDialog ref="editDialog" @saved="reloadWith(`${$event.username} 已更新。`)" />
  </section>
</template>
