<script setup>
import { ref } from 'vue';
import { importSiteData } from '../api.js';
import { importQuestion, readSiteData, SITE_DATA_URL } from '../siteData.js';

const busy = ref(false);
const progress = ref(0);
const error = ref('');
const warning = ref('');
const input = ref(null);

async function choose(event) {
  const [file] = event.target.files;
  event.target.value = ''; // 同一個檔案可以再選一次
  if (!file) return;
  error.value = '';
  warning.value = '';
  try {
    if (!window.confirm(importQuestion(await readSiteData(file)))) return;
    busy.value = true;
    progress.value = 0;
    const { missingFiles } = await importSiteData(file, (ratio) => { progress.value = ratio; });
    if (missingFiles) warning.value = `有 ${missingFiles} 張照片或文件的檔案不在匯入的資料裡（原本的網站就已遺失），這些項目會無法開啟。`;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="settings-group" aria-labelledby="site-data-title">
    <h2 id="site-data-title" class="settings-group__title">網站資料</h2>
    <p class="site-data__text">
      輸出的檔案（.tar）包含頁面、公告、相簿、照片、文件、網站設定、頁首選單與訪問人數，可以留作備份，或匯入另一個網站。帳號與密碼不包含在內。
    </p>
    <div class="site-data__actions">
      <a class="button button--quiet" :href="SITE_DATA_URL" :aria-disabled="busy" @click="busy && $event.preventDefault()">輸出網站資料</a>
      <button type="button" class="button button--quiet" :disabled="busy" @click="input.click()">
        {{ busy ? (progress < 1 ? `上傳中 ${Math.floor(progress * 100)}%` : '匯入中…') : '匯入網站資料' }}
      </button>
      <input ref="input" type="file" accept=".tar,application/x-tar" hidden @change="choose" />
    </div>
    <small class="site-data__text">匯入會取代目前網站的所有內容，無法復原；匯入前建議先輸出一份。照片多時檔案會很大，上傳與匯入需要一些時間，完成前請不要關閉這個頁面。</small>
    <p v-if="warning" role="status" class="notice">{{ warning }}</p>
    <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
  </section>
</template>
