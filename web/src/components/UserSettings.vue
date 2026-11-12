<script setup>
import { nextTick, ref, useId, useTemplateRef } from 'vue';
import { can } from '../api.js';
import ChangePasswordForm from './ChangePasswordForm.vue';
import DisplayNameForm from './DisplayNameForm.vue';
import UserManager from './UserManager.vue';

const titleId = useId();
const dialog = useTemplateRef('dialog');
// 關閉時移除內容，輸入到一半的密碼不會留在畫面上
const opened = ref(false);

async function open() {
  opened.value = true;
  await nextTick();
  dialog.value.showModal();
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="editor user-settings" :aria-labelledby="titleId" @close="opened = false">
    <template v-if="opened">
      <div class="user-settings__head">
        <h2 :id="titleId">帳號設定</h2>
        <button type="button" class="button button--small button--quiet" @click="dialog.close()">關閉</button>
      </div>
      <DisplayNameForm />
      <ChangePasswordForm />
      <UserManager v-if="can('MANAGE_USERS')" />
    </template>
  </dialog>
</template>
