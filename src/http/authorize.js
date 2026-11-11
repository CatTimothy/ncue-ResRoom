import { hasPermission } from '../lib/guards.js';

/** 不經過 GraphQL 的請求用：要登入且有所有列出的權限。不通過時直接回應並回傳 false */
export async function authorize({ sessions, req, res, permissions, message, reply }) {
  const context = await sessions.current(req.headers.cookie);
  const rejected = !context.user ? [401, '請先登入']
    : !permissions.every((permission) => hasPermission(context, permission)) ? [403, message]
      : null;
  if (rejected) reply(res, ...rejected);
  return !rejected;
}
