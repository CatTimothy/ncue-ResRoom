import { fail, gqlError } from '../lib/errors.js';
import { requirePermission, requireUser, withPermission } from '../lib/guards.js';
import { checkPasswordStrength, hashPassword, MAX_PASSWORD_LENGTH, usesDefaultPassword, verifyPassword } from '../lib/password.js';
import { ALL_PERMISSIONS } from '../lib/permissions.js';

export const authTypeDefs = /* GraphQL */ `
  enum Permission {
    ${ALL_PERMISSIONS.join('\n    ')}
  }

  type User {
    username: String!
    permissions: [Permission!]!
    "密碼是公開的預設密碼（src/lib/password.js 的 DEFAULT_USER），應該立刻更改"
    usesDefaultPassword: Boolean!
  }

  extend type Query {
    "目前登入的使用者，未登入時為 null"
    me: User
    "需要 MANAGE_USERS"
    users: [User!]!
  }

  extend type Mutation {
    login(username: String!, password: String!): User!
    logout: Boolean!
    "更改自己的密碼並登出所有裝置，目前的裝置會換一個新的登入狀態"
    changePassword(currentPassword: String!, newPassword: String!): Boolean!
    "需要 MANAGE_USERS。帳號已存在時會失敗，不會覆蓋"
    createUser(username: String!, password: String!, permissions: [Permission!]!): User!
    "需要 MANAGE_USERS，不能變更自己的權限，所以至少會留下一位可以管理帳號的人"
    setUserPermissions(username: String!, permissions: [Permission!]!): User!
  }
`;

/** 去除重複，並依固定順序儲存 */
const normalize = (permissions) => ALL_PERMISSIONS.filter((permission) => permissions.includes(permission));

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function createAuthResolvers({ db, sessions }) {
  const attempts = new Map();

  /** 累計一次登入嘗試，回傳是否仍在限制內 */
  function recordAttempt(key) {
    const now = Date.now();
    if (attempts.size > 10000) {
      for (const [k, entry] of attempts) if (entry.resetAt <= now) attempts.delete(k);
    }
    const entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count += 1;
    return entry.count <= MAX_ATTEMPTS;
  }

  return {
    User: {
      usesDefaultPassword: (user) => usesDefaultPassword(user.passwordHash),
    },

    Query: {
      me: (_, __, context) => context.user,
      users(_, __, context) {
        requirePermission(context, 'MANAGE_USERS');
        return db.prepare('SELECT * FROM users ORDER BY username').all();
      },
    },

    Mutation: {
      async login(_, { username, password }, context) {
        const key = `${context.req.socket.remoteAddress}:${username}`;
        if (!recordAttempt(key)) throw gqlError('嘗試次數過多，請 15 分鐘後再試', 'TOO_MANY_REQUESTS');

        const user = await db.prepare('SELECT * FROM users WHERE username = $1').get(username);
        let valid = false;
        if (password.length <= MAX_PASSWORD_LENGTH) {
          // 帳號不存在時同樣計算雜湊，避免從回應時間判斷帳號是否存在
          if (user) valid = await verifyPassword(password, user.passwordHash);
          else await hashPassword(password);
        }
        if (!valid) throw gqlError('帳號或密碼錯誤', 'BAD_CREDENTIALS');

        attempts.delete(key);
        await sessions.start(user.username, context.res);
        if (await usesDefaultPassword(user.passwordHash)) console.warn(`警告：帳號 ${user.username} 以預設密碼登入，請立刻更改密碼。`);
        return user;
      },

      async logout(_, __, context) {
        await sessions.end(context.tokenHash, context.res);
        return true;
      },

      async changePassword(_, { currentPassword, newPassword }, context) {
        const { username, passwordHash } = requireUser(context);
        checkPasswordStrength(newPassword);

        // 登入狀態被盜用時，也不能用這裡無限次猜測密碼
        const key = `change-password:${username}`;
        if (!recordAttempt(key)) throw gqlError('嘗試次數過多，請 15 分鐘後再試', 'TOO_MANY_REQUESTS');
        const valid = currentPassword.length <= MAX_PASSWORD_LENGTH && await verifyPassword(currentPassword, passwordHash);
        if (!valid) fail('目前的密碼不正確');
        attempts.delete(key);

        await db.prepare(`
          WITH updated AS (
            UPDATE users SET password_hash = $2 WHERE username = $1 RETURNING username
          )
          DELETE FROM sessions WHERE username IN (SELECT username FROM updated)
        `).run(username, await hashPassword(newPassword));
        // 權杖可能就是被盜用才要改密碼，所以目前的裝置也要換新的
        await sessions.start(username, context.res);
        return true;
      },

      ...withPermission('MANAGE_USERS', {
        async createUser(_, { username, password, permissions }) {
          checkPasswordStrength(password);
          const user = await db.prepare(`
            INSERT INTO users (username, password_hash, permissions) VALUES ($1, $2, $3)
            ON CONFLICT (username) DO NOTHING
            RETURNING *
          `).get(username, await hashPassword(password), normalize(permissions));
          return user ?? fail(`帳號「${username}」已經存在`);
        },

        async setUserPermissions(_, { username, permissions }, context) {
          if (username === context.user.username) fail('不能變更自己的權限');
          // 鎖住操作者：兩個人同時移除對方的帳號管理權限時，只有一個會成功，不會變成沒有人能管理帳號
          const user = await db.prepare(`
            UPDATE users SET permissions = $2 WHERE username = $1 AND EXISTS (
              SELECT 1 FROM users WHERE username = $3 AND 'MANAGE_USERS' = ANY (permissions) FOR SHARE
            )
            RETURNING *
          `).get(username, normalize(permissions), context.user.username);
          return user ?? fail(`找不到帳號「${username}」`);
        },
      }),
    },
  };
}
