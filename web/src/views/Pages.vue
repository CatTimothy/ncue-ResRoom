<script setup>
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { can, deletePage, fetchPages, saveNavigation } from '../api.js';
import ItemStatus from '../components/ItemStatus.vue';
import NavEditor from '../components/NavEditor.vue';
import PageEditor from '../components/PageEditor.vue';
import { linkInput, mapMenus, navigationKeys, pagePath, SERVICES } from '../navigation.js';
import { rocDateTimeText } from '../format.js';
import { confirmDelete } from '../page.js';
import { isExtensionEnabled, navigation } from '../siteConfig.js';
import { useCachedItem } from '../useCachedItem.js';
import { useEditMode, useLeaveGuard } from '../useEditMode.js';
import { useEditor } from '../useEditor.js';

const router = useRouter();
const { active: creating, close } = useEditMode('MANAGE_PAGES', 'new');
const state = useCachedItem(() => 'pages', fetchPages);
const { item: pages } = state;

/** 可以放進選單、列在「網站功能」的：首頁與啟用中的擴充功能 */
const services = computed(() => Object.keys(SERVICES).filter((key) => key === 'HOME' || isExtensionEnabled(key)));

const remove = (page) => confirmDelete(`確定要刪除頁面「${page.title}」嗎？`, () => deletePage(page.slug));

// 頁首選單：選單載入後填入；編輯中不被背景更新蓋掉
const { form, changed, busy, error, reset, markSaved, run } = useEditor({ navigation: null });
useLeaveGuard(changed);

const restore = () => reset({ navigation: navigationKeys(navigation.value) });
watch(navigation, (nav) => {
  if (nav && !changed.value) restore();
}, { immediate: true });

const saveMenus = () => run(async () => {
  await saveNavigation(mapMenus(form.navigation, linkInput));
  markSaved();
});
</script>

<template>
  <div class="page">
    <PageEditor v-if="creating" @done="(path) => router.replace(path)" @cancel="close" />

    <template v-else>
      <h1 class="stop">所有頁面</h1>

      <section v-if="can('MANAGE_SITE_CONFIG')" class="settings-group pages-section" aria-labelledby="nav-title">
        <h2 id="nav-title" class="settings-group__title">頁首選單</h2>
        <p v-if="!form.navigation" class="loading">載入中…</p>
        <template v-else>
          <NavEditor v-model="form.navigation" :pages="pages ?? []" :services="services" />
          <p v-if="error" role="alert" class="notice notice--error">{{ error }}</p>
          <div class="editor__actions">
            <button type="button" class="button button--quiet" :disabled="busy || !changed" @click="restore">還原</button>
            <button type="button" class="button" :disabled="busy || !changed" @click="saveMenus">{{ busy ? '處理中…' : '儲存選單' }}</button>
          </div>
        </template>
      </section>

      <section class="settings-group pages-section" aria-labelledby="services-title">
        <h2 id="services-title" class="settings-group__title">網站功能</h2>
        <div v-if="can('MANAGE_SITE_CONFIG')" class="admin-bar">
          <RouterLink class="button button--small button--quiet" to="/extensions">管理擴充功能</RouterLink>
        </div>
        <ul class="document-list">
          <li v-for="key in services" :key="key">
            <div class="document-list__main">
              <RouterLink :to="SERVICES[key].to">{{ SERVICES[key].label }}</RouterLink>
              <small class="edited">{{ SERVICES[key].to }}</small>
            </div>
          </li>
        </ul>
      </section>

      <section class="settings-group pages-section" aria-labelledby="pages-title">
        <h2 id="pages-title" class="settings-group__title">頁面</h2>
        <div v-if="can('MANAGE_PAGES')" class="admin-bar">
          <RouterLink class="button button--small" to="/pages?new=1">新增頁面</RouterLink>
        </div>
        <ul v-if="pages?.length" class="document-list">
          <li v-for="page in pages" :key="page.slug">
            <div class="document-list__main">
              <RouterLink :to="pagePath(page)">{{ page.title }}</RouterLink>
              <small class="edited">{{ pagePath(page) }}，建立於 {{ rocDateTimeText(page.createdAt) }}，編輯於 {{ rocDateTimeText(page.updatedAt) }}</small>
            </div>
            <div v-if="can('MANAGE_PAGES')" class="row-actions">
              <RouterLink class="button button--small button--quiet" :aria-label="`編輯頁面：${page.title}`" :to="`${pagePath(page)}?edit=1`">編輯</RouterLink>
              <button type="button" class="button button--small button--quiet" :aria-label="`刪除頁面：${page.title}`" @click="remove(page)">刪除</button>
            </div>
          </li>
        </ul>
        <p v-else-if="pages">目前沒有頁面。</p>
        <ItemStatus :state="state" what="頁面清單" />
      </section>
    </template>
  </div>
</template>
