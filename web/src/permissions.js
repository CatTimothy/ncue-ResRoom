/** 權限與顯示名稱，要和 src/lib/permissions.js 一致；順序就是畫面上的順序 */
export const PERMISSIONS = {
  MANAGE_ANNOUNCEMENTS: '公告',
  MANAGE_ALBUMS: '相簿與照片',
  MANAGE_DOCUMENTS: '文件',
  MANAGE_PAGES: '頁面',
  MANAGE_SITE_CONFIG: '頁尾',
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
