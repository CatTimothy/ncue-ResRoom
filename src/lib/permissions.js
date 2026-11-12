import { EXTENSION_METAS } from '../../web/src/extensions/meta.js';
import { CORE_PERMISSIONS } from '../../web/src/reservedPaths.js';

/**
 * 所有權限：各擴充功能的（寫在 web/src/extensions/<名稱>/meta.js）加上核心的。新增核心權限時：
 * 1. 加在這裡（GraphQL 的 Permission 列舉會跟著更新）
 * 2. 在 web/src/permissions.js 加上顯示名稱
 * 3. 用 withPermission / requirePermission 保護對應的操作，前端用 can() 決定要不要顯示按鈕
 * 4. 既有帳號不會自動得到新權限，需要的話由管理員勾選，或在 schema.sql 寫升級語句
 */
export const ALL_PERMISSIONS = [
  ...EXTENSION_METAS.flatMap((meta) => Object.keys(meta.permissions ?? {})),
  ...CORE_PERMISSIONS,
];

/** 可以上傳內文圖片（uploadContentImage）的權限 */
export const CONTENT_IMAGE_PERMISSIONS = ['MANAGE_ANNOUNCEMENTS', 'MANAGE_PAGES', 'MANAGE_SITE_CONFIG'];

/** 有其中一項才能上傳檔案。上傳不限大小，所以要在解析請求前就擋下其他帳號 */
export const UPLOAD_PERMISSIONS = [...CONTENT_IMAGE_PERMISSIONS, 'MANAGE_ALBUMS', 'MANAGE_DOCUMENTS'];

/** 輸出與匯入網站資料（src/http/site-data.js）要有全部的內容權限：輸出包含未發布的內容，匯入會取代所有內容 */
// 只包含系統擴充功能：其他擴充功能的資料不在輸出裡，不該因為新增擴充功能就讓原本的管理員不能輸出
export const SITE_DATA_PERMISSIONS = [
  ...EXTENSION_METAS.filter((meta) => meta.system).flatMap((meta) => Object.keys(meta.permissions ?? {})),
  'MANAGE_PAGES',
  'MANAGE_SITE_CONFIG',
];
