// 自動產生，請勿手動修改：新增或移除擴充功能的資料夾後執行 npm run extensions:sync。說明見 docs/extensions.md
// 擴充功能的伺服器部分：各資料夾 index.js 的 typeDefs、createResolvers、passiveMutations、staticSite。啟用狀態見 ./state.js
import announcements from './announcements/index.js';
import documents from './documents/index.js';
import photos from './photos/index.js';

/** 所有擴充功能，順序和 web/src/extensions/meta.js 一致 */
export const EXTENSIONS = [announcements, photos, documents];
