// 活動剪影（系統擴充功能）的伺服器部分。基本資料在 web/src/extensions/photos/meta.js
import meta from '../../../web/src/extensions/photos/meta.js';
import { albumsTypeDefs, createAlbumsResolvers } from './albums.js';
import { createPhotosResolvers, photosTypeDefs } from './photos.js';
import staticSite from './static.js';

export default {
  ...meta,
  typeDefs: [albumsTypeDefs, photosTypeDefs],
  createResolvers: [createAlbumsResolvers, createPhotosResolvers],
  staticSite,
};
