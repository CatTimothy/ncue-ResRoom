// 最新消息（系統擴充功能）的伺服器部分。基本資料在 web/src/extensions/announcements/meta.js
import meta from '../../../web/src/extensions/announcements/meta.js';
import { announcementsTypeDefs, createAnnouncementsResolvers } from './graphql.js';
import staticSite from './static.js';

export default {
  ...meta,
  typeDefs: [announcementsTypeDefs],
  createResolvers: [createAnnouncementsResolvers],
  // 不會改變公開內容的 mutation（見 src/graphql/index.js）
  passiveMutations: ['recordAnnouncementView'],
  staticSite,
};
