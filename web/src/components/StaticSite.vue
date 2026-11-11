<script setup>
/** 下載靜態網站（src/static-site）：伺服器產生 ZIP 後瀏覽器直接下載，不經過 api.js */
const STATIC_SITE_URL = '/static-site';
</script>

<template>
  <section class="settings-group" aria-labelledby="static-site-title">
    <h2 id="static-site-title" class="settings-group__title">靜態網站</h2>
    <p class="site-data__text">
      把目前公開的內容（首頁、最新消息、活動剪影、文件下載與所有頁面）輸出成 HTML 檔，打包成 ZIP。
      解壓縮後放到任何網頁伺服器，或直接開啟裡面的 index.html 就能瀏覽，不需要這個系統與資料庫。
    </p>
    <div class="site-data__actions">
      <a class="button button--quiet" :href="STATIC_SITE_URL">下載靜態網站</a>
    </div>
    <small class="site-data__text">尚未發布的公告和沒有照片的相簿不會包含在內；靜態網站沒有登入、搜尋與瀏覽人次的功能。照片多時要等一下才會開始下載。</small>
  </section>
</template>
