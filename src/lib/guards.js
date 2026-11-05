import { gqlError } from './errors.js';

export function requireUser(context) {
  if (!context.user) throw gqlError('請先登入', 'UNAUTHENTICATED');
  return context.user;
}

export const hasPermission = (context, permission) => Boolean(context.user?.permissions.includes(permission));

/** 要求登入，且至少有其中一項權限 */
export function requirePermission(context, ...anyOf) {
  requireUser(context);
  if (!anyOf.some((permission) => hasPermission(context, permission))) {
    throw gqlError('你沒有這項操作的權限', 'FORBIDDEN');
  }
}

/** 讓一組 mutation resolver 都要求權限；permissions 可以是一項或多項（有其中一項即可） */
export function withPermission(permissions, resolvers) {
  const anyOf = [permissions].flat();
  return Object.fromEntries(
    Object.entries(resolvers).map(([name, resolve]) => [
      name,
      (parent, args, context) => {
        requirePermission(context, ...anyOf);
        return resolve(parent, args, context);
      },
    ]),
  );
}
