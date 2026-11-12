// 活動剪影（系統擴充功能）的網站部分：網址與首頁區塊
import Album from './Album.vue';
import Albums from './Albums.vue';
import HomeSection from './HomeSection.vue';
import meta from './meta.js';

export default {
  ...meta,
  routes: [
    { path: meta.path, component: Albums },
    { path: `${meta.path}/:id`, component: Album, props: true },
  ],
  home: HomeSection,
};
