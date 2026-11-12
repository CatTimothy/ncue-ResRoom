// 自動產生，請勿手動修改：新增或移除擴充功能的資料夾後執行 npm run extensions:sync。說明見 docs/extensions.md
// 所有擴充功能的基本資料，依 order 排列（首頁區塊、權限清單、選單都用這個順序）。伺服器與網站共用，只能是純資料
import announcements from './announcements/meta.js';
import documents from './documents/meta.js';
import photos from './photos/meta.js';

/** 每項是 { key, label, description, path, order, system, permissions }，見各資料夾的 meta.js */
export const EXTENSION_METAS = [announcements, photos, documents];

export const extensionMeta = (key) => EXTENSION_METAS.find((meta) => meta.key === key) ?? null;
