<script setup>
import { useTemplateRef } from 'vue';
import { can, fetchSiteConfig } from '../api.js';
import { telHref } from '../format.js';
import { useCachedItem } from '../useCachedItem.js';
import { useTodayVisits } from '../useTodayVisits.js';
import FooterEditor from './FooterEditor.vue';

const editor = useTemplateRef('editor');
const visitors = useTodayVisits();
const year = new Date().getFullYear();
const { item: config } = useCachedItem(() => 'site-config', fetchSiteConfig);
</script>

<template>
  <footer class="site-footer">
    <template v-if="config">
      <div class="site-footer__head">
        <h2 class="site-footer__title">{{ config.footerTitle }}</h2>
        <button v-if="can('MANAGE_SITE_CONFIG')" type="button" class="button button--small button--quiet" @click="editor.open(config)">編輯頁尾</button>
      </div>
      <p class="site-footer__phone">
        <a :href="telHref(config.phone)">{{ config.phone }}</a>
        <span v-if="config.extension">{{ config.extension }}</span>
      </p>
      <dl v-if="config.hours || config.teachers.length">
        <div v-if="config.hours">
          <dt>開放時間</dt>
          <dd>{{ config.hours }}</dd>
        </div>
        <div v-if="config.teachers.length">
          <dt>聯絡老師</dt>
          <dd>
            <template v-for="({ name, email, extension }, index) in config.teachers" :key="index">
              <br v-if="index" />
              {{ name }} <a :href="`mailto:${email}`">{{ email }}</a>
              <span v-if="extension"> 分機 {{ extension }}</span>
            </template>
          </dd>
        </div>
      </dl>
    </template>
    <div v-if="config || visitors !== null" class="site-footer__bottom">
      <small v-if="config">Copyright © {{ year }} {{ config.copyright }}</small>
      <small v-if="visitors !== null">今日訪問人數：{{ visitors }}</small>
    </div>
  </footer>

  <FooterEditor v-if="can('MANAGE_SITE_CONFIG')" ref="editor" />
</template>
