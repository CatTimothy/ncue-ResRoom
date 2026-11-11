import { hasPermission } from '../lib/guards.js';
import { UPLOAD_PERMISSIONS } from '../lib/permissions.js';
import { respond } from './respond.js';

// 欄位值的限制在 src/db/schema.sql；這裡是解析請求前就要擋下的上限。
// 上傳檔案需要權限，且照片不限大小，所以只限制一般請求
const MAX_JSON_BODY = 4 * 1024 * 1024;

/** 沒有 Origin（非瀏覽器）、在 CORS_ORIGINS 裡，或和網站同一個 host */
export function isAllowedOrigin(origin, host, allowedOrigins) {
  if (!origin || allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** 回傳拒絕原因 [狀態碼, 訊息]；可放行時回傳 null */
async function rejection(req, sessions, allowedOrigins) {
  // SameSite 擋不住同網域下其他子網域的請求，所以另外檢查來源
  if (!isAllowedOrigin(req.headers.origin, req.headers.host, allowedOrigins)) return [403, 'Forbidden origin'];

  // 先檢查大小與權限，避免不能上傳的請求佔用記憶體
  const isUpload = (req.headers['content-type'] ?? '').startsWith('multipart/');
  const length = Number(req.headers['content-length']);
  if (!Number.isFinite(length)) return [411, 'Length required'];
  if (isUpload) {
    const context = await sessions.current(req.headers.cookie);
    if (!context.user) return [401, 'Unauthorized'];
    return UPLOAD_PERMISSIONS.some((permission) => hasPermission(context, permission)) ? null : [403, 'Forbidden'];
  }
  if (length > MAX_JSON_BODY) return [413, 'Payload too large'];
  return null;
}

/** 檢查 POST；不通過時直接回應並回傳 false */
export function createRequestGuard({ sessions, allowedOrigins }) {
  return async function checkRequest(req, res) {
    if (req.method !== 'POST') return true;
    const rejected = await rejection(req, sessions, allowedOrigins);
    if (rejected) respond(res, ...rejected);
    return !rejected;
  };
}
