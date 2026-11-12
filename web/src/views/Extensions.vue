<script setup>
import { ref } from 'vue';
import { can, setExtensionEnabled, userChecked } from '../api.js';
import { extensionStates } from '../siteConfig.js';

const busy = ref(null);
const error = ref('');

async function toggle(extension) {
  const enabled = !extension.enabled;
  if (!enabled && !window.confirm(`確定要停用「${extension.label}」嗎？\n網址、頁首選單的連結與首頁區塊會隱藏，已有的內容會保留，重新啟用後就會恢復。`)) return;
  busy.value = extension.key;
  error.value = '';
  try {
    await setExtensionEnabled(extension.key, enabled, extension.label);
  } catch (reason) {
    error.value = reason.message;
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="page">
    <h1 class="stop">擴充功能</h1>
    <p v-if="!userChecked" class="loading">載入中…</p>
    <p v-else-if="!can('MANAGE_SITE_CONFIG')">你沒有管理擴充功能的權限。</p>

    <section v-else class="settings-group pages-section" aria-labelledby="extensions-title">
      <h2 id="extensions-title" class="settings-group__title">已安裝的擴充功能</h2>
      <p class="site-data__text">
        停用後，該功能的網址、頁首選單的連結、首頁區塊與靜態網站的頁面都會隱藏，已有的內容會保留；重新啟用時，若頁首選單沒有它，會加到主選單的最後。
      </p>
      <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
      <p v-if="!extensionStates" class="loading">載入中…</p>
      <ul v-else class="document-list">
        <li v-for="extension in extensionStates" :key="extension.key">
          <div class="document-list__main">
            <RouterLink v-if="extension.enabled" :to="extension.path">{{ extension.label }}</RouterLink>
            <span v-else>{{ extension.label }}</span>
            <small class="edited">
              {{ extension.description }}
              <br />
              {{ extension.path }}，{{ extension.system ? '系統擴充功能' : '擴充功能' }}，{{ extension.enabled ? '啟用中' : '已停用' }}
            </small>
          </div>
          <div class="row-actions">
            <button
              type="button"
              class="button button--small"
              :class="{ 'button--quiet': extension.enabled }"
              :disabled="busy !== null"
              :aria-label="`${extension.enabled ? '停用' : '啟用'}：${extension.label}`"
              @click="toggle(extension)"
            >
              {{ busy === extension.key ? '處理中…' : extension.enabled ? '停用' : '啟用' }}
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
