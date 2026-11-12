// 文件下載（系統擴充功能）的網站部分：網址
import Documents from './Documents.vue';
import meta from './meta.js';

export default {
  ...meta,
  routes: [{ path: meta.path, component: Documents }],
};
