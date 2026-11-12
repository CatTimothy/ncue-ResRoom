// 最新消息（系統擴充功能）的網站部分：網址與首頁區塊
import Announcement from './Announcement.vue';
import Announcements from './Announcements.vue';
import HomeSection from './HomeSection.vue';
import meta from './meta.js';

export default {
  ...meta,
  routes: [
    { path: meta.path, component: Announcements },
    { path: `${meta.path}/:id`, component: Announcement, props: true },
  ],
  home: HomeSection,
};
