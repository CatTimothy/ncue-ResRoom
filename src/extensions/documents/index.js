// 文件下載（系統擴充功能）的伺服器部分。基本資料在 web/src/extensions/documents/meta.js
import meta from '../../../web/src/extensions/documents/meta.js';
import { createDocumentsResolvers, documentsTypeDefs } from './graphql.js';
import staticSite from './static.js';

export default {
  ...meta,
  typeDefs: [documentsTypeDefs],
  createResolvers: [createDocumentsResolvers],
  staticSite,
};
