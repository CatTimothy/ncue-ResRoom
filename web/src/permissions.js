import { EXTENSION_METAS } from './extensions/meta.js';

/** 權限與顯示名稱，要和 src/lib/permissions.js 一致；順序就是畫面上的順序。擴充功能的權限寫在各自的 meta.js */
export const PERMISSIONS = {
  ...Object.assign({}, ...EXTENSION_METAS.map((meta) => meta.permissions ?? {})),
  MANAGE_PAGES: '頁面',
  MANAGE_SITE_CONFIG: '網站設定',
  MANAGE_USERS: '帳號管理',
};

/** 列出權限名稱，例如「公告、文件」 */
export function permissionsText(permissions) {
  if (!permissions.length) return '沒有權限';
  if (permissions.length === Object.keys(PERMISSIONS).length) return '全部權限';
  return Object.keys(PERMISSIONS)
    .filter((permission) => permissions.includes(permission))
    .map((permission) => PERMISSIONS[permission])
    .join('、');
}
