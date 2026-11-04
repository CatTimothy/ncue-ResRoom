import { gqlError } from './errors.js';

export function requireUser(context) {
  if (!context.user) throw gqlError('請先登入', 'UNAUTHENTICATED');
  return context.user;
}

/** 讓一組 mutation resolver 都要求登入 */
export function withLogin(resolvers) {
  return Object.fromEntries(
    Object.entries(resolvers).map(([name, resolve]) => [
      name,
      (parent, args, context) => {
        requireUser(context);
        return resolve(parent, args, context);
      },
    ]),
  );
}
