<script setup>
import { can } from '../api.js';
import { telHref } from '../format.js';
import { siteConfig as config } from '../siteConfig.js';
import { useTodayVisits } from '../useTodayVisits.js';

const COPYRIGHT = 'CatTimothy';
const visitors = useTodayVisits();
const year = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <template v-if="config">
      <div class="site-footer__head">
        <h2 class="site-footer__title">{{ config.footerTitle }}</h2>
        <RouterLink v-if="can('MANAGE_SITE_CONFIG')" class="button button--small button--quiet" to="/settings">編輯頁尾</RouterLink>
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
    <div class="site-footer__bottom">
      <small>Copyright © {{ year }} {{ COPYRIGHT }}</small>
      <small v-if="visitors !== null">今日訪問人數：{{ visitors }}</small>
    </div>
  </footer>
</template>
