<script setup>
import { can } from '../api.js';
import { telHref } from '../format.js';
import { siteConfig as config } from '../siteConfig.js';
import { useTodayVisits } from '../useTodayVisits.js';

const COPYRIGHT = 'CatTimothy';
const GITHUB_URL = 'https://github.com/CatTimothy/ncue-ResRoom';
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
      <a class="site-footer__github" :href="GITHUB_URL" target="_blank" rel="noopener" aria-label="GitHub 原始碼">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>
        GitHub
      </a>
    </div>
  </footer>
</template>
