/** 核心功能用掉的第一層網址；擴充功能的 path 與放在第一層的頁面都不能用（src/scripts/extensions.js 也會檢查） */
export const CORE_PATHS = ['pages', 'settings', 'extensions', 'login', 'files', 'assets', 'graphql', 'site-data', 'static-site'];

/** 核心的權限；擴充功能不能用這些名稱 */
export const CORE_PERMISSIONS = ['MANAGE_PAGES', 'MANAGE_SITE_CONFIG', 'MANAGE_USERS'];
